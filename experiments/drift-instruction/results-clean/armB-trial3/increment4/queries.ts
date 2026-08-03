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
 * The ten adjustments made in the current calendar month with the biggest
 * change in count (by magnitude, in either direction), returning who made
 * each one, the product, the store, the amount the count changed by and the
 * reason given.
 *
 * Index: the month filter is a range scan on InventoryAdjustment.adjustedAt,
 * served by @@index([adjustedAt]) in schema.prisma. "Largest" is by |unitsDelta|,
 * which SQLite/Prisma can't express in orderBy, so the top ten are selected in
 * JS after the month's rows are fetched; no index serves that ranking.
 */
export interface LargestAdjustmentRow {
  adjustedBy: string;
  productName: string;
  storeName: string;
  unitsDelta: number;
  reason: string;
}

export async function getLargestAdjustmentsThisMonth(
  now: Date = new Date()
): Promise<LargestAdjustmentRow[]> {
  // Current calendar month, [monthStart, nextMonthStart).
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const rows = await prisma.inventoryAdjustment.findMany({
    where: { adjustedAt: { gte: monthStart, lt: nextMonthStart } },
    select: {
      adjustedBy: true,
      unitsDelta: true,
      reason: true,
      store: { select: { name: true } },
      product: { select: { name: true } },
    },
  });

  return rows
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
 * Page 6 — One person's adjustments over a date range.
 *
 * Every inventory adjustment a given person made within [start, end), across
 * every store and product, returning the store, the product, the amount the
 * count changed by, the reason given and when it happened. Most recent first.
 *
 * Index: filters by adjustedBy equality then range-scans adjustedAt, served by
 * @@index([adjustedBy, adjustedAt]) in schema.prisma. The person match and the
 * date bounds are both covered by that one compound index.
 */
export interface PersonAdjustmentRow {
  storeName: string;
  productName: string;
  unitsDelta: number;
  reason: string;
  adjustedAt: Date;
}

export async function getPersonAdjustments(
  adjustedBy: string,
  start: Date,
  end: Date
): Promise<PersonAdjustmentRow[]> {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedBy,
      adjustedAt: { gte: start, lt: end },
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
 * For a chosen snapshot date, every store that reported inventory that day with
 * a count of how many of its products were out of stock, one row per store.
 * Stores that reported inventory but had no stockouts show a count of 0.
 *
 * Index: both groupBy queries filter InventoryDaily by snapshotDate equality and
 * group by storeId. No new index is needed — the existing
 * @@unique([snapshotDate, storeId, productId]) is backed by an index whose
 * leading column snapshotDate serves the equality filter and whose second column
 * storeId serves the grouping (the same index Page 4 relies on for its
 * snapshotDate-filtered group-by). isStockout is a residual predicate applied to
 * the rows the index already narrows to.
 */
export interface StoreStockoutCountRow {
  storeId: number;
  storeName: string;
  stockoutCount: number;
}

export async function getStoreStockoutCounts(
  snapshotDate: Date
): Promise<StoreStockoutCountRow[]> {
  // Every store that reported inventory on the snapshot date (one row per store).
  const present = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { snapshotDate },
  });

  if (present.length === 0) {
    return [];
  }

  // Of those, how many products were out of stock per store on that date.
  const stockouts = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { snapshotDate, isStockout: true },
    _count: { _all: true },
  });
  const countByStore = new Map(
    stockouts.map((s) => [s.storeId, s._count._all])
  );

  // Resolve store names for the stores that reported inventory that day.
  const stores = await prisma.store.findMany({
    where: { id: { in: present.map((p) => p.storeId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(stores.map((s) => [s.id, s.name]));

  return present
    .map((p) => ({
      storeId: p.storeId,
      storeName: nameById.get(p.storeId) ?? "",
      stockoutCount: countByStore.get(p.storeId) ?? 0,
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));
}

/**
 * Page 8 — A product's cost per unit over time.
 *
 * For a chosen product, how its cost per unit has changed over time, combined
 * across every store that carries it, one row per snapshot date, ordered from
 * earliest snapshot date to latest. The per-date cost is the average cost per
 * unit across the stores that reported that product on that date.
 *
 * Index: filters InventoryDaily by productId equality then groups and orders by
 * snapshotDate, served by @@index([productId, snapshotDate]) in schema.prisma —
 * productId leads for the equality match, snapshotDate follows for the per-date
 * grouping and ascending order. The existing @@unique([snapshotDate, storeId,
 * productId]) can't serve this because it leads with snapshotDate, not productId.
 */
export interface ProductCostTrendRow {
  snapshotDate: Date;
  averageCostPerUnit: number;
}

export async function getProductCostTrend(
  productId: number
): Promise<ProductCostTrendRow[]> {
  // Average cost per unit per snapshot date across every store carrying the
  // product, ordered earliest to latest.
  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["snapshotDate"],
    where: { productId },
    _avg: { costPerUnit: true },
    orderBy: { snapshotDate: "asc" },
  });

  return grouped.map((g) => ({
    snapshotDate: g.snapshotDate,
    averageCostPerUnit: g._avg.costPerUnit ?? 0,
  }));
}
