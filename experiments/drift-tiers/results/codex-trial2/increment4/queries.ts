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
 * Page 5 — The ten largest inventory adjustments made this month.
 *
 * Returns the person who made each adjustment, product, store, change in
 * units and reason.  Adjustments are ranked by the magnitude of their unit
 * change, so both large increases and large decreases are included.
 *
 * `asOf` is injectable for callers that need to render a specific month; by
 * default, the current UTC month is used.
 */
export interface TopInventoryAdjustmentRow {
  adjustedBy: string;
  productName: string;
  storeName: string;
  unitsDelta: number;
  reason: string;
}

export async function getTopInventoryAdjustments(
  asOf: Date = new Date()
): Promise<TopInventoryAdjustmentRow[]> {
  const monthStart = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1)
  );
  const nextMonthStart = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 1)
  );

  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedAt: { gte: monthStart, lt: nextMonthStart },
    },
    select: {
      id: true,
      adjustedBy: true,
      unitsDelta: true,
      reason: true,
      adjustedAt: true,
      product: { select: { name: true } },
      store: { select: { name: true } },
    },
  });

  return rows
    .sort(
      (a, b) =>
        Math.abs(b.unitsDelta) - Math.abs(a.unitsDelta) ||
        b.adjustedAt.getTime() - a.adjustedAt.getTime() ||
        b.id - a.id
    )
    .slice(0, 10)
    .map((row) => ({
      adjustedBy: row.adjustedBy,
      productName: row.product.name,
      storeName: row.store.name,
      unitsDelta: row.unitsDelta,
      reason: row.reason,
    }));
}

// Descriptive alias for callers that prefer the page's wording.
export const getLargestInventoryAdjustmentsThisMonth =
  getTopInventoryAdjustments;

/**
 * Page 7 — Stockouts by store for a snapshot date.
 *
 * Every store is returned, including stores with no products out of stock on
 * the selected date.  The count is based on the inventory snapshot's
 * `isStockout` flag rather than deriving it from units on hand.
 */
export interface StoreStockoutCountRow {
  storeId: number;
  storeName: string;
  stockoutCount: number;
}

export async function getStoreStockoutCounts(
  snapshotDate: Date
): Promise<StoreStockoutCountRow[]> {
  const [stores, grouped] = await Promise.all([
    prisma.store.findMany({
      select: { id: true, name: true },
    }),
    prisma.inventoryDaily.groupBy({
      by: ["storeId"],
      where: { snapshotDate, isStockout: true },
      _count: { _all: true },
    }),
  ]);

  const countByStoreId = new Map(
    grouped.map((group) => [group.storeId, group._count._all])
  );

  return stores
    .map((store) => ({
      storeId: store.id,
      storeName: store.name,
      stockoutCount: countByStoreId.get(store.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        a.storeName.localeCompare(b.storeName) || a.storeId - b.storeId
    );
}

// Descriptive aliases for callers that use the page's wording.
export const getStoreStockouts = getStoreStockoutCounts;
export const getStockoutsByStore = getStoreStockoutCounts;
export const getStoreOutOfStockCounts = getStoreStockoutCounts;
export const getOutOfStockByStore = getStoreStockoutCounts;

/**
 * Page 8 — A product's cost history across stores.
 *
 * Average cost per unit for one product on each snapshot date, combining every
 * store inventory row for that product and ordering from earliest to latest.
 */
export interface ProductCostHistoryRow {
  snapshotDate: Date;
  costPerUnit: number;
}

export async function getProductCostHistory(
  productId: number
): Promise<ProductCostHistoryRow[]> {
  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["snapshotDate"],
    where: { productId },
    _avg: { costPerUnit: true },
    orderBy: { snapshotDate: "asc" },
  });

  return grouped.map((group) => ({
    snapshotDate: group.snapshotDate,
    costPerUnit: group._avg.costPerUnit ?? 0,
  }));
}

// Descriptive aliases for callers that use the page's wording.
export const getProductCostPerUnitHistory = getProductCostHistory;
export const getProductCostOverTime = getProductCostHistory;

/**
 * Page 6 — Inventory adjustments by person.
 *
 * Every inventory adjustment made by one person within a date window, across
 * all stores and products.  Returns the store, product, unit change, reason
 * and timestamp, most recent first.
 */
export interface PersonInventoryAdjustmentRow {
  storeName: string;
  productName: string;
  unitsDelta: number;
  reason: string;
  adjustedAt: Date;
}

export async function getInventoryAdjustmentsByPerson(
  adjustedBy: string,
  startDate: Date,
  endDate: Date
): Promise<PersonInventoryAdjustmentRow[]> {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedBy,
      adjustedAt: { gte: startDate, lte: endDate },
    },
    select: {
      unitsDelta: true,
      reason: true,
      adjustedAt: true,
      store: { select: { name: true } },
      product: { select: { name: true } },
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
