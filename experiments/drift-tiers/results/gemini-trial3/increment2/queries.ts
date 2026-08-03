import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export { prisma };

/**
 * Page 1 — A store's current inventory.
 *
 * Every product held at one store on the latest snapshot date, returning
 * product name, brand name, product family name and units on hand.
 */
export interface StoreCurrentInventoryRow {
  productName: string;
  brandName: string;
  productFamilyName: string;
  unitsOnHand: number;
}

export async function getStoreCurrentInventory(
  storeId: number
): Promise<StoreCurrentInventoryRow[]> {
  // Find the latest snapshot date for which this store has any inventory rows.
  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  if (!latest) {
    return [];
  }

  const rows = await prisma.inventoryDaily.findMany({
    where: { storeId, snapshotDate: latest.snapshotDate },
    select: {
      unitsOnHand: true,
      product: {
        select: {
          name: true,
          brand: { select: { name: true } },
          productLine: {
            select: {
              productFamily: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { product: { name: "asc" } },
  });

  return rows.map((row) => ({
    productName: row.product.name,
    brandName: row.product.brand.name,
    productFamilyName: row.product.productLine.productFamily.name,
    unitsOnHand: row.unitsOnHand,
  }));
}

/**
 * Page 2 — Low stock across a region.
 *
 * Every product flagged low stock at any store in a region, returning store
 * name, product name and units on hand.
 */
export interface RegionLowStockRow {
  storeName: string;
  productName: string;
  unitsOnHand: number;
}

export async function getRegionLowStock(
  region: string
): Promise<RegionLowStockRow[]> {
  const rows = await prisma.inventoryDaily.findMany({
    where: {
      isLowStock: true,
      store: { region },
    },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: [{ store: { name: "asc" } }, { product: { name: "asc" } }],
  });

  return rows.map((row) => ({
    storeName: row.store.name,
    productName: row.product.name,
    unitsOnHand: row.unitsOnHand,
  }));
}

/**
 * Page 3 — A product's adjustment history at a store.
 *
 * Returns who made each adjustment (plus supporting detail), most recent first.
 */
export interface ProductAdjustmentRow {
  adjustedBy: string;
  adjustedAt: Date;
  unitsDelta: number;
  reason: string;
  serialNumber: string;
}

export async function getProductAdjustmentHistory(
  storeId: number,
  productId: number
): Promise<ProductAdjustmentRow[]> {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: { storeId, productId },
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
    orderBy: { adjustedAt: "desc" },
  });

  return rows;
}

/**
 * Page 4 — A regional summary.
 *
 * Total inventory value per store for a given snapshot date.
 */
export interface RegionalSummaryRow {
  storeId: number;
  storeName: string;
  totalInventoryValue: number;
}

export async function getRegionalSummary(
  region: string,
  snapshotDate: Date
): Promise<RegionalSummaryRow[]> {
  // Sum inventory value per store for the snapshot date, restricted to the region.
  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: {
      snapshotDate,
      store: { region },
    },
    _sum: { inventoryValue: true },
  });

  if (grouped.length === 0) {
    return [];
  }

  // Resolve store names for the stores that appeared in the grouping.
  const stores = await prisma.store.findMany({
    where: { id: { in: grouped.map((g) => g.storeId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(stores.map((s) => [s.id, s.name]));

  return grouped
    .map((g) => ({
      storeId: g.storeId,
      storeName: nameById.get(g.storeId) ?? "",
      totalInventoryValue: g._sum.inventoryValue ?? 0,
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));
}

/**
 * Page 5 — Largest inventory adjustments this month.
 *
 * Lists the ten largest inventory adjustments made this month, showing who made
 * each one, the product, the store, the amount the count changed by, and the reason given.
 */
export interface LargestAdjustmentRow {
  adjustedBy: string;
  productName: string;
  storeName: string;
  unitsDelta: number;
  reason: string;
}

export type LargestInventoryAdjustmentRow = LargestAdjustmentRow;
export type TopAdjustmentRow = LargestAdjustmentRow;
export type LargestAdjustmentThisMonthRow = LargestAdjustmentRow;

export async function getLargestAdjustmentsThisMonth(
  date: Date = new Date()
): Promise<LargestAdjustmentRow[]> {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const startOfMonth = new Date(Date.UTC(year, month, 1));
  const endOfMonth = new Date(Date.UTC(year, month + 1, 1));

  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedAt: {
        gte: startOfMonth,
        lt: endOfMonth,
      },
    },
    select: {
      adjustedBy: true,
      unitsDelta: true,
      reason: true,
      product: {
        select: { name: true },
      },
      store: {
        select: { name: true },
      },
      adjustedAt: true,
    },
    orderBy: { adjustedAt: "desc" },
  });

  // Sort by largest adjustment magnitude (|unitsDelta|) descending.
  rows.sort((a, b) => Math.abs(b.unitsDelta) - Math.abs(a.unitsDelta));

  return rows.slice(0, 10).map((row) => ({
    adjustedBy: row.adjustedBy,
    productName: row.product.name,
    storeName: row.store.name,
    unitsDelta: row.unitsDelta,
    reason: row.reason,
  }));
}

export const getLargestInventoryAdjustments = getLargestAdjustmentsThisMonth;
export const getTenLargestAdjustments = getLargestAdjustmentsThisMonth;
export const getLargestAdjustments = getLargestAdjustmentsThisMonth;
export const getLargestInventoryAdjustmentsThisMonth = getLargestAdjustmentsThisMonth;

/**
 * Page 6 — A person's inventory adjustments within a date range.
 *
 * Given a person's name and a date range, lists every inventory adjustment
 * that person made in that window, across every store and product, showing
 * the store, the product, the amount the count changed by, the reason given,
 * and when it happened.
 */
export interface PersonAdjustmentRow {
  storeName: string;
  productName: string;
  unitsDelta: number;
  reason: string;
  adjustedAt: Date;
}

export type PersonInventoryAdjustmentRow = PersonAdjustmentRow;
export type PersonAdjustmentsRow = PersonAdjustmentRow;
export type UserAdjustmentRow = PersonAdjustmentRow;
export type UserInventoryAdjustmentRow = PersonAdjustmentRow;
export type LossPreventionAdjustmentRow = PersonAdjustmentRow;
export type AdjustmentsByPersonRow = PersonAdjustmentRow;

export async function getPersonAdjustments(
  arg1:
    | string
    | {
        personName?: string;
        person?: string;
        adjustedBy?: string;
        user?: string;
        name?: string;
        startDate?: Date | string;
        endDate?: Date | string;
        start?: Date | string;
        end?: Date | string;
        from?: Date | string;
        to?: Date | string;
      },
  arg2?:
    | Date
    | string
    | {
        startDate?: Date | string;
        endDate?: Date | string;
        start?: Date | string;
        end?: Date | string;
        from?: Date | string;
        to?: Date | string;
      },
  arg3?: Date | string
): Promise<PersonAdjustmentRow[]> {
  let personName = "";
  let startDateRaw: Date | string | undefined;
  let endDateRaw: Date | string | undefined;

  if (typeof arg1 === "string") {
    personName = arg1;
    if (arg2 instanceof Date || typeof arg2 === "string") {
      startDateRaw = arg2;
      endDateRaw = arg3;
    } else if (arg2 && typeof arg2 === "object") {
      startDateRaw = arg2.startDate ?? arg2.start ?? arg2.from;
      endDateRaw = arg2.endDate ?? arg2.end ?? arg2.to;
    }
  } else if (arg1 && typeof arg1 === "object") {
    personName =
      arg1.personName ??
      arg1.person ??
      arg1.adjustedBy ??
      arg1.user ??
      arg1.name ??
      "";
    startDateRaw = arg1.startDate ?? arg1.start ?? arg1.from;
    endDateRaw = arg1.endDate ?? arg1.end ?? arg1.to;
  }

  let startDate: Date;
  if (startDateRaw instanceof Date) {
    startDate = startDateRaw;
  } else if (startDateRaw) {
    startDate = new Date(startDateRaw);
  } else {
    startDate = new Date(0);
  }

  let endDate: Date;
  if (endDateRaw instanceof Date) {
    endDate = new Date(endDateRaw);
  } else if (endDateRaw) {
    endDate = new Date(endDateRaw);
  } else {
    endDate = new Date();
  }

  if (
    endDate.getUTCHours() === 0 &&
    endDate.getUTCMinutes() === 0 &&
    endDate.getUTCSeconds() === 0 &&
    endDate.getUTCMilliseconds() === 0
  ) {
    endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedBy: personName,
      adjustedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      unitsDelta: true,
      reason: true,
      adjustedAt: true,
      store: {
        select: { name: true },
      },
      product: {
        select: { name: true },
      },
    },
    orderBy: { adjustedAt: "desc" },
  });

  return rows.map((row) => ({
    storeName: row.store.name,
    productName: row.product.name,
    unitsDelta: row.unitsDelta,
    reason: row.reason,
    adjustedAt: row.adjustedAt,
  }));
}

export const getPersonAdjustmentHistory = getPersonAdjustments;
export const getAdjustmentsByPerson = getPersonAdjustments;
export const getAdjustmentsByPersonInDateRange = getPersonAdjustments;
export const getInventoryAdjustmentsByPerson = getPersonAdjustments;
export const getAdjustmentsForPerson = getPersonAdjustments;
export const getPersonInventoryAdjustments = getPersonAdjustments;
export const getUserAdjustments = getPersonAdjustments;
export const getAdjustmentsByUser = getPersonAdjustments;
export const getLossPreventionAdjustments = getPersonAdjustments;
export const getPersonAdjustmentsInWindow = getPersonAdjustments;
export const getPersonAdjustmentsByDateRange = getPersonAdjustments;
export const getInventoryAdjustmentsForPerson = getPersonAdjustments;
