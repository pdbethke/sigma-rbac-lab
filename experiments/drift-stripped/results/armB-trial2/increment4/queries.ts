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
 * Page 5 — The month's largest inventory adjustments.
 *
 * The ten largest adjustments made in the calendar month containing `monthOf`,
 * returning who made each one, the product, the store, the amount the count
 * changed by and the reason given. "Largest" means largest by magnitude, so a
 * big write-down ranks alongside a big correction up.
 */
export interface LargestAdjustmentRow {
  adjustedBy: string;
  productName: string;
  storeName: string;
  unitsDelta: number;
  reason: string;
}

export async function getLargestAdjustments(
  monthOf: Date
): Promise<LargestAdjustmentRow[]> {
  // Half-open range [start of month, start of next month) in UTC, matching how
  // the seed stores adjustedAt.
  const monthStart = new Date(
    Date.UTC(monthOf.getUTCFullYear(), monthOf.getUTCMonth(), 1)
  );
  const nextMonthStart = new Date(
    Date.UTC(monthOf.getUTCFullYear(), monthOf.getUTCMonth() + 1, 1)
  );

  const rows = await prisma.inventoryAdjustment.findMany({
    where: { adjustedAt: { gte: monthStart, lt: nextMonthStart } },
    select: {
      adjustedBy: true,
      unitsDelta: true,
      reason: true,
      adjustedAt: true,
      store: { select: { name: true } },
      product: { select: { name: true } },
    },
  });

  // Prisma cannot order by absolute value, so rank by magnitude here (the same
  // fetch-then-sort approach the regional summary uses), most recent first to
  // break ties, then keep the ten largest.
  return rows
    .sort(
      (a, b) =>
        Math.abs(b.unitsDelta) - Math.abs(a.unitsDelta) ||
        b.adjustedAt.getTime() - a.adjustedAt.getTime()
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

/**
 * Page 6 — One person's adjustments across the chain.
 *
 * Every inventory adjustment a given person made within a date range, across
 * every store and product, returning the store, the product, the amount the
 * count changed by, the reason given and when it happened. Most recent first.
 */
export interface PersonAdjustmentRow {
  storeName: string;
  productName: string;
  unitsDelta: number;
  reason: string;
  adjustedAt: Date;
}

export async function getPersonAdjustments(
  person: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<PersonAdjustmentRow[]> {
  // Half-open range [rangeStart, rangeEnd), matching the convention used by the
  // month's-largest page above and how the seed stores adjustedAt.
  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedBy: person,
      adjustedAt: { gte: rangeStart, lt: rangeEnd },
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
 * One row per store, giving how many of its products were out of stock on the
 * chosen snapshot date. Every store that has a snapshot that date is included,
 * so a store with no stockouts still appears with a zero count.
 */
export interface StoreStockoutCountRow {
  storeId: number;
  storeName: string;
  stockoutCount: number;
}

export async function getStoreStockoutCounts(
  snapshotDate: Date
): Promise<StoreStockoutCountRow[]> {
  // The universe of stores for this page is every store that has a snapshot on
  // the date, so stores with zero stockouts still get a row.
  const storesInSnapshot = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { snapshotDate },
  });

  if (storesInSnapshot.length === 0) {
    return [];
  }

  // Count the stocked-out products per store for the same date.
  const stockouts = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { snapshotDate, isStockout: true },
    _count: { _all: true },
  });
  const countByStore = new Map(
    stockouts.map((s) => [s.storeId, s._count._all])
  );

  // Resolve store names for the stores that appeared in the snapshot.
  const stores = await prisma.store.findMany({
    where: { id: { in: storesInSnapshot.map((g) => g.storeId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(stores.map((s) => [s.id, s.name]));

  return storesInSnapshot
    .map((g) => ({
      storeId: g.storeId,
      storeName: nameById.get(g.storeId) ?? "",
      stockoutCount: countByStore.get(g.storeId) ?? 0,
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));
}

/**
 * Page 8 — A product's cost-per-unit trend over time.
 *
 * One row per snapshot date on which the product was held anywhere, giving its
 * cost per unit combined across every store that carried it that date (the
 * average of those stores' per-unit costs, the same way the regional summary
 * aggregates with groupBy). Ordered from earliest snapshot date to latest.
 */
export interface ProductCostTrendRow {
  snapshotDate: Date;
  avgCostPerUnit: number;
}

export async function getProductCostTrend(
  productId: number
): Promise<ProductCostTrendRow[]> {
  // Average cost per unit per snapshot date, across every store carrying the
  // product, oldest date first.
  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["snapshotDate"],
    where: { productId },
    _avg: { costPerUnit: true },
    orderBy: { snapshotDate: "asc" },
  });

  return grouped.map((g) => ({
    snapshotDate: g.snapshotDate,
    avgCostPerUnit: g._avg.costPerUnit ?? 0,
  }));
}
