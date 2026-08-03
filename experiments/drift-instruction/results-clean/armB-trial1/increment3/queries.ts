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
 * The ten adjustments made this month with the largest change in count (by
 * magnitude, in either direction), returning who made each one, the product,
 * the store, the amount the count changed by and the reason given.
 *
 * Index: filtering is by `adjustedAt` within the month, served by
 * `@@index([adjustedAt])` on InventoryAdjustment. The "largest by magnitude"
 * ranking is |unitsDelta|, which Prisma's `orderBy` can't express (no abs), so
 * the month's rows are ranked and sliced in JS — no index serves that step.
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
  // Month boundaries: [first of this month, first of next month).
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedAt: { gte: monthStart, lt: monthEnd },
    },
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
 * Page 6 — One person's adjustment activity.
 *
 * Every inventory adjustment a given person made within a date range, across
 * every store and product, returning the store, the product, the amount the
 * count changed by, the reason given and when it happened. Most recent first.
 *
 * Index: filtering is by `adjustedBy` (equality) then `adjustedAt` within the
 * range, served by `@@index([adjustedBy, adjustedAt])` on InventoryAdjustment.
 * The leading column narrows to the person; the trailing column both satisfies
 * the range and provides the `adjustedAt` ordering without a separate sort.
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
  from: Date,
  to: Date
): Promise<PersonAdjustmentRow[]> {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedBy,
      adjustedAt: { gte: from, lt: to },
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
 * For a chosen snapshot date, every store with a count of how many of its
 * products were out of stock (isStockout) on that date, one row per store.
 * Stores with no stockouts on that date still appear, with a count of 0.
 *
 * Index: the stockout count filters InventoryDaily by `snapshotDate` (equality)
 * and `isStockout` (equality) before grouping by `storeId`, served by
 * `@@index([snapshotDate, isStockout])` on InventoryDaily. The leading
 * snapshotDate column narrows to the chosen day; the trailing isStockout column
 * narrows to the stocked-out rows within it. The full store list comes from a
 * separate scan of Store (its own small table, no new index needed), and the
 * per-store counts are joined to it in JS so zero-count stores are retained.
 */
export interface StoreStockoutCountRow {
  storeId: number;
  storeName: string;
  stockoutCount: number;
}

export async function getStoreStockoutCounts(
  snapshotDate: Date
): Promise<StoreStockoutCountRow[]> {
  // Count stocked-out products per store for the snapshot date.
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

  // Every store appears, including those with no stockouts on this date.
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
