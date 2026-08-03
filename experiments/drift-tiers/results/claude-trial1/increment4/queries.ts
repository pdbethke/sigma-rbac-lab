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
 * Page 5 — This month's largest inventory adjustments.
 *
 * The ten adjustments made in the current calendar month whose count change is
 * largest in magnitude (in either direction), returning who made each one, the
 * product, the store, the amount the count changed by and the reason given.
 */
export interface LargestAdjustmentRow {
  adjustedBy: string;
  productName: string;
  storeName: string;
  unitsDelta: number;
  reason: string;
}

export async function getLargestAdjustmentsThisMonth(): Promise<
  LargestAdjustmentRow[]
> {
  // Bounds of the current calendar month: [monthStart, nextMonthStart).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const monthWhere = {
    adjustedAt: { gte: monthStart, lt: nextMonthStart },
  };
  const select = {
    id: true,
    adjustedBy: true,
    unitsDelta: true,
    reason: true,
    store: { select: { name: true } },
    product: { select: { name: true } },
  };

  // "Largest" means largest magnitude in either direction, which SQLite can't
  // order by directly. Take the top candidates from each end of unitsDelta, then
  // rank by absolute magnitude in memory.
  const [largestIncreases, largestDecreases] = await Promise.all([
    prisma.inventoryAdjustment.findMany({
      where: monthWhere,
      select,
      orderBy: { unitsDelta: "desc" },
      take: 10,
    }),
    prisma.inventoryAdjustment.findMany({
      where: monthWhere,
      select,
      orderBy: { unitsDelta: "asc" },
      take: 10,
    }),
  ]);

  // Merge the two ends, dropping any rows that appear in both.
  const byId = new Map(
    [...largestIncreases, ...largestDecreases].map((row) => [row.id, row])
  );

  return [...byId.values()]
    .sort((a, b) => Math.abs(b.unitsDelta) - Math.abs(a.unitsDelta))
    .slice(0, 10)
    .map((row) => ({
      adjustedBy: row.adjustedBy,
      productName: row.product.name,
      storeName: row.store.name,
      unitsDelta: row.unitsDelta,
      reason: row.reason,
    }));
}

/**
 * Page 6 — A person's inventory adjustments over a date range.
 *
 * Every adjustment a given person made within a date window, across every store
 * and product, returning the store, the product, the amount the count changed
 * by, the reason given and when it happened. Most recent first.
 *
 * The window is inclusive of both `from` and `to`.
 */
export interface PersonAdjustmentRow {
  storeName: string;
  productName: string;
  unitsDelta: number;
  reason: string;
  adjustedAt: Date;
}

export async function getAdjustmentsByPerson(
  adjustedBy: string,
  from: Date,
  to: Date
): Promise<PersonAdjustmentRow[]> {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedBy,
      adjustedAt: { gte: from, lte: to },
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

/**
 * Page 7 — Stockouts per store on a snapshot date.
 *
 * For a chosen snapshot date, every store together with a count of how many of
 * its products were out of stock on that date. One row per store; stores with
 * no stockouts on that date report a count of zero.
 */
export interface StoreStockoutCountRow {
  storeId: number;
  storeName: string;
  stockoutCount: number;
}

export async function getStoreStockoutCounts(
  snapshotDate: Date
): Promise<StoreStockoutCountRow[]> {
  // Count the stockout rows per store for the snapshot date.
  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: {
      snapshotDate,
      isStockout: true,
    },
    _count: { _all: true },
  });
  const countByStoreId = new Map(
    grouped.map((g) => [g.storeId, g._count._all])
  );

  // Every store gets a row, including those with no stockouts on that date.
  const stores = await prisma.store.findMany({
    select: { id: true, name: true },
  });

  return stores
    .map((store) => ({
      storeId: store.id,
      storeName: store.name,
      stockoutCount: countByStoreId.get(store.id) ?? 0,
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));
}

/**
 * Page 8 — A product's cost-per-unit trend over time.
 *
 * For one product, its cost per unit on each snapshot date, combined across
 * every store that carries it, ordered from earliest snapshot date to latest.
 *
 * "Combined across every store" is the mean cost per unit over the stores that
 * held the product on each snapshot date.
 */
export interface ProductCostTrendRow {
  snapshotDate: Date;
  costPerUnit: number;
}

export async function getProductCostTrend(
  productId: number
): Promise<ProductCostTrendRow[]> {
  // Average cost per unit across all stores carrying the product, per snapshot
  // date, oldest date first.
  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["snapshotDate"],
    where: { productId },
    _avg: { costPerUnit: true },
    orderBy: { snapshotDate: "asc" },
  });

  return grouped.map((g) => ({
    snapshotDate: g.snapshotDate,
    costPerUnit: g._avg.costPerUnit ?? 0,
  }));
}
