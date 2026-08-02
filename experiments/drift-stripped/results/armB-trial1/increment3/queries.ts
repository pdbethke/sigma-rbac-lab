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
 * Page 5 — The largest inventory adjustments this month.
 *
 * The ten adjustments made in the given month with the biggest change in count
 * (by magnitude, so a large negative correction ranks alongside a large
 * positive one), returning who made each one, the product, the store, the
 * amount the count changed by and the reason given.
 */
export interface LargestAdjustmentRow {
  adjustedBy: string;
  productName: string;
  storeName: string;
  unitsDelta: number;
  reason: string;
}

export async function getLargestAdjustmentsThisMonth(
  monthStart: Date,
  monthEnd: Date
): Promise<LargestAdjustmentRow[]> {
  // Pull this month's adjustments, then rank by magnitude of the change. SQLite
  // via Prisma can't order by abs(unitsDelta), so we sort in code and take ten.
  const rows = await prisma.inventoryAdjustment.findMany({
    where: { adjustedAt: { gte: monthStart, lt: monthEnd } },
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
 * Every inventory adjustment a given person made within a window, across every
 * store and product, returning the store, the product, the amount the count
 * changed by, the reason given and when it happened. Most recent first.
 *
 * The window is half-open [rangeStart, rangeEnd), matching the convention used
 * by getLargestAdjustmentsThisMonth above.
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
  rangeStart: Date,
  rangeEnd: Date
): Promise<PersonAdjustmentRow[]> {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedBy,
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
 * For a chosen snapshot date, every store and how many of its products were out
 * of stock that day, one row per store. Stores with no stockouts on the date
 * still appear, with a count of zero.
 */
export interface StoreStockoutCountRow {
  storeId: number;
  storeName: string;
  stockoutCount: number;
}

export async function getStoreStockoutCounts(
  snapshotDate: Date
): Promise<StoreStockoutCountRow[]> {
  // Count out-of-stock products per store for the snapshot date. This only
  // yields stores that had at least one stockout, so we backfill the rest below.
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

  // List every store so those with no stockouts on the date still get a row.
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
