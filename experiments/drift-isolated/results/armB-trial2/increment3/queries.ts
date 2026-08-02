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
 * The ten adjustments made in the current calendar month with the largest
 * change in units (by magnitude, whether the count went up or down), returning
 * who made each one, the product, the store, the units delta and the reason.
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
  // Bound to the current calendar month: [first of this month, first of next).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const select = {
    id: true,
    adjustedBy: true,
    unitsDelta: true,
    reason: true,
    store: { select: { name: true } },
    product: { select: { name: true } },
  } as const;
  const where = { adjustedAt: { gte: monthStart, lt: monthEnd } };

  // "Largest" means largest magnitude, but Prisma can't order by abs(). The
  // top ten by magnitude must lie within the ten most positive and the ten most
  // negative deltas, so we fetch both ends and rank the union in JS.
  const [mostPositive, mostNegative] = await Promise.all([
    prisma.inventoryAdjustment.findMany({
      where,
      select,
      orderBy: { unitsDelta: "desc" },
      take: 10,
    }),
    prisma.inventoryAdjustment.findMany({
      where,
      select,
      orderBy: { unitsDelta: "asc" },
      take: 10,
    }),
  ]);

  // Union the two ends, de-duplicating rows that appear in both (small months).
  const byId = new Map<number, (typeof mostPositive)[number]>();
  for (const row of [...mostPositive, ...mostNegative]) {
    byId.set(row.id, row);
  }

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
 * Every adjustment one person made between two dates, across every store and
 * product, returning the store, the product, the change in units, the reason
 * given and when it happened, most recent first.
 *
 * The range is inclusive of both bounds: [from, to].
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
 * Page 7 — Stockouts per store for a snapshot date.
 *
 * For a chosen snapshot date, every store that has a snapshot that day, with a
 * count of how many of its products were out of stock, one row per store.
 * Stores with a snapshot but no stockouts are included with a count of zero.
 */
export interface StoreStockoutCountRow {
  storeId: number;
  storeName: string;
  stockoutCount: number;
}

export async function getStoreStockoutCounts(
  snapshotDate: Date
): Promise<StoreStockoutCountRow[]> {
  // Two groupings over the snapshot date: one to establish the universe of
  // stores that reported inventory that day, one to count stockouts. A store
  // in the first but not the second had a snapshot with no stockouts (count 0).
  const [reporting, stockouts] = await Promise.all([
    prisma.inventoryDaily.groupBy({
      by: ["storeId"],
      where: { snapshotDate },
    }),
    prisma.inventoryDaily.groupBy({
      by: ["storeId"],
      where: { snapshotDate, isStockout: true },
      _count: { _all: true },
    }),
  ]);

  if (reporting.length === 0) {
    return [];
  }

  const countByStoreId = new Map(
    stockouts.map((s) => [s.storeId, s._count._all])
  );

  // Resolve store names for the stores that appeared in the grouping.
  const stores = await prisma.store.findMany({
    where: { id: { in: reporting.map((g) => g.storeId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(stores.map((s) => [s.id, s.name]));

  return reporting
    .map((g) => ({
      storeId: g.storeId,
      storeName: nameById.get(g.storeId) ?? "",
      stockoutCount: countByStoreId.get(g.storeId) ?? 0,
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));
}
