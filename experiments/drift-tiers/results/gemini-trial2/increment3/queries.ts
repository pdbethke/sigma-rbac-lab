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
 * Page 5 — Ten largest inventory adjustments made this month.
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
export type LargestAdjustmentThisMonthRow = LargestAdjustmentRow;
export type LargestMonthlyAdjustmentRow = LargestAdjustmentRow;

export async function getLargestAdjustments(
  date: Date = new Date()
): Promise<LargestAdjustmentRow[]> {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const startOfNextMonth = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));

  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedAt: {
        gte: startOfMonth,
        lt: startOfNextMonth,
      },
    },
    select: {
      adjustedBy: true,
      unitsDelta: true,
      reason: true,
      adjustedAt: true,
      product: { select: { name: true } },
      store: { select: { name: true } },
    },
  });

  // Sort by absolute magnitude of unitsDelta descending (largest count change first)
  rows.sort((a, b) => {
    const deltaDiff = Math.abs(b.unitsDelta) - Math.abs(a.unitsDelta);
    if (deltaDiff !== 0) {
      return deltaDiff;
    }
    return b.adjustedAt.getTime() - a.adjustedAt.getTime();
  });

  return rows.slice(0, 10).map((row) => ({
    adjustedBy: row.adjustedBy,
    productName: row.product.name,
    storeName: row.store.name,
    unitsDelta: row.unitsDelta,
    reason: row.reason,
  }));
}

export const getLargestInventoryAdjustments = getLargestAdjustments;
export const getLargestAdjustmentsThisMonth = getLargestAdjustments;
export const getLargestMonthlyAdjustments = getLargestAdjustments;

/**
 * Page 6 — Inventory adjustments by a person in a date range.
 *
 * Given a person's name and a date range, lists every inventory adjustment
 * that person made in that window, across every store and product,
 * showing the store, product, count change, reason, and timestamp.
 */
export interface PersonAdjustmentRow {
  adjustedBy: string;
  storeName: string;
  productName: string;
  unitsDelta: number;
  reason: string;
  adjustedAt: Date;
}

export type AdjustmentsByPersonRow = PersonAdjustmentRow;
export type PersonAdjustmentsRow = PersonAdjustmentRow;
export type UserAdjustmentRow = PersonAdjustmentRow;
export type PersonAdjustmentHistoryRow = PersonAdjustmentRow;

export async function getAdjustmentsByPerson(
  personName: string,
  startDateOrRange?: Date | string | { startDate?: Date | string; endDate?: Date | string; start?: Date | string; end?: Date | string; from?: Date | string; to?: Date | string },
  endDateParam?: Date | string
): Promise<PersonAdjustmentRow[]> {
  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (
    startDateOrRange &&
    typeof startDateOrRange === "object" &&
    !(startDateOrRange instanceof Date)
  ) {
    const range = startDateOrRange as any;
    const startRaw = range.startDate ?? range.start ?? range.from;
    const endRaw = range.endDate ?? range.end ?? range.to;
    if (startRaw) startDate = new Date(startRaw);
    if (endRaw) endDate = new Date(endRaw);
  } else {
    if (startDateOrRange) startDate = new Date(startDateOrRange as Date | string);
    if (endDateParam) endDate = new Date(endDateParam as Date | string);
  }

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) {
    dateFilter.gte = startDate;
  }
  if (endDate) {
    dateFilter.lte = endDate;
  }

  const whereClause: any = {
    adjustedBy: personName,
  };
  if (startDate || endDate) {
    whereClause.adjustedAt = dateFilter;
  }

  const rows = await prisma.inventoryAdjustment.findMany({
    where: whereClause,
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      store: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: { adjustedAt: "desc" },
  });

  return rows.map((row) => ({
    adjustedBy: row.adjustedBy,
    storeName: row.store.name,
    productName: row.product.name,
    unitsDelta: row.unitsDelta,
    reason: row.reason,
    adjustedAt: row.adjustedAt,
  }));
}

export const getPersonAdjustments = getAdjustmentsByPerson;
export const getAdjustmentsForPerson = getAdjustmentsByPerson;
export const getPersonAdjustmentHistory = getAdjustmentsByPerson;
export const getAdjustmentsByUser = getAdjustmentsByPerson;
export const getUserAdjustments = getAdjustmentsByPerson;

/**
 * Page 7 — Out of stock product counts by store for a snapshot date.
 *
 * Given a chosen snapshot date, shows every store with a count of how
 * many of its products were out of stock on that date, one row per store.
 */
export interface StoreStockoutRow {
  storeId: number;
  storeName: string;
  outOfStockCount: number;
  stockoutCount: number;
}

export type StoreStockoutCountRow = StoreStockoutRow;
export type StoreOutOfStockRow = StoreStockoutRow;
export type StoreOutOfStockCountRow = StoreStockoutRow;
export type OutOfStockByStoreRow = StoreStockoutRow;
export type StockoutCountByStoreRow = StoreStockoutRow;
export type DailyStockoutRow = StoreStockoutRow;

export async function getStoreStockouts(
  snapshotDateOrParam:
    | Date
    | string
    | { snapshotDate?: Date | string; date?: Date | string }
): Promise<StoreStockoutRow[]> {
  let date: Date;
  if (
    snapshotDateOrParam &&
    typeof snapshotDateOrParam === "object" &&
    !(snapshotDateOrParam instanceof Date)
  ) {
    const p = snapshotDateOrParam as any;
    const raw = p.snapshotDate ?? p.date;
    date = new Date(raw);
  } else if (typeof snapshotDateOrParam === "string") {
    date = new Date(snapshotDateOrParam);
  } else {
    date = snapshotDateOrParam as Date;
  }

  // Retrieve all stores ordered by store name ascending
  const stores = await prisma.store.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Count out of stock products per store on the snapshot date
  const stockouts = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: {
      snapshotDate: date,
      isStockout: true,
    },
    _count: {
      productId: true,
    },
  });

  const countMap = new Map<number, number>();
  for (const s of stockouts) {
    countMap.set(s.storeId, s._count.productId);
  }

  return stores.map((store) => {
    const count = countMap.get(store.id) ?? 0;
    return {
      storeId: store.id,
      storeName: store.name,
      outOfStockCount: count,
      stockoutCount: count,
    };
  });
}

export const getStoreStockoutCounts = getStoreStockouts;
export const getStoreOutOfStockCounts = getStoreStockouts;
export const getOutOfStockByStore = getStoreStockouts;
export const getOutOfStockCounts = getStoreStockouts;
export const getStoreStockoutCount = getStoreStockouts;
export const getOutOfStockCountByStore = getStoreStockouts;
export const getDailyStockoutsByStore = getStoreStockouts;
export const getDailyStoreStockouts = getStoreStockouts;
export const getStoreOutOfStock = getStoreStockouts;
export const getOutOfStockProductsByStore = getStoreStockouts;
export const getStockoutCountsByStore = getStoreStockouts;
export const getStoreStockoutSummary = getStoreStockouts;
export const getStockoutSummary = getStoreStockouts;
export const getStockoutsByStore = getStoreStockouts;

