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
 * The ten adjustments made this month with the biggest change in count,
 * ranked by the size of the change regardless of direction (a large write-down
 * counts the same as a large write-up). Returns who made each adjustment, the
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

  const rows = await prisma.inventoryAdjustment.findMany({
    where: { adjustedAt: { gte: monthStart, lt: nextMonthStart } },
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      store: { select: { name: true } },
      product: { select: { name: true } },
    },
  });

  // "Largest" means biggest magnitude of change; SQLite can't order by an
  // absolute value through Prisma, so rank here. Break ties by most recent.
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
 * Page 6 — One person's adjustments over a date range.
 *
 * Every inventory adjustment a given person made between two dates, across all
 * stores and products, returning the store, the product, the amount the count
 * changed by, the reason given and when it happened. Most recent first.
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
