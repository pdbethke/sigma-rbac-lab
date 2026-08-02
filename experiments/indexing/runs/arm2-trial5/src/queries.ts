import { Prisma, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Page queries for the retail inventory app.
 *
 * Every function here is written against a fact table (InventoryDaily) holding
 * years of daily snapshots for hundreds of stores. Two rules shape the code:
 *
 *  1. Never let a query touch more than one snapshot date's worth of rows
 *     unless the page genuinely means "over time". All four pages below are
 *     point-in-time, so each one pins snapshotDate.
 *  2. Never post-filter or post-aggregate in JS. Counting, summing and paging
 *     happen in SQL so the database can stop at the index range.
 */

// ---------------------------------------------------------------------------
// 1. A store's current inventory
// ---------------------------------------------------------------------------

export interface StoreInventoryRow {
  productName: string;
  brandName: string;
  productFamilyName: string;
  unitsOnHand: number;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  snapshotDate: Date | null;
}

/**
 * Every product held at one store on that store's latest snapshot date.
 *
 * Done in two steps on purpose. Step one asks the index
 * [storeId, snapshotDate] for the single newest date at this store -- an index
 * range scan that stops after one row, rather than a MAX() over the store's
 * whole history. Step two then reads exactly that one store-day slice.
 *
 * A store carries thousands of SKUs, so this is paged; the caller renders a
 * table, not the entire slice.
 */
export async function getStoreCurrentInventory(
  storeId: number,
  options: { skip?: number; take?: number } = {}
): Promise<Paged<StoreInventoryRow>> {
  const { skip = 0, take = 100 } = options;

  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  if (!latest) {
    return { rows: [], total: 0, snapshotDate: null };
  }

  const where: Prisma.InventoryDailyWhereInput = {
    storeId,
    snapshotDate: latest.snapshotDate,
  };

  const [records, total] = await prisma.$transaction([
    prisma.inventoryDaily.findMany({
      where,
      select: {
        unitsOnHand: true,
        product: {
          select: {
            name: true,
            brand: { select: { brandName: true } },
            productLine: {
              select: { productFamily: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { productId: "asc" },
      skip,
      take,
    }),
    prisma.inventoryDaily.count({ where }),
  ]);

  return {
    snapshotDate: latest.snapshotDate,
    total,
    rows: records.map((r) => ({
      productName: r.product.name,
      brandName: r.product.brand.brandName,
      productFamilyName: r.product.productLine.productFamily.name,
      unitsOnHand: r.unitsOnHand,
    })),
  };
}

// ---------------------------------------------------------------------------
// 2. Low stock across a region
// ---------------------------------------------------------------------------

export interface RegionLowStockRow {
  storeName: string;
  productName: string;
  unitsOnHand: number;
}

/**
 * Every product flagged low stock at any store in a region.
 *
 * The page reads as "what is low right now", not "everything that has ever
 * been low", so it is pinned to a snapshot date. Omit `snapshotDate` and we
 * resolve the chain's most recent one first -- without that pin this query
 * would sweep years of history and return the same SKU once per day it was
 * low.
 *
 * The region filter is expressed as a relation filter on Store, which Prisma
 * compiles to a subquery over the small Store table; the fact-table side then
 * rides [storeId, snapshotDate, isLowStock].
 */
export async function getRegionLowStock(
  region: string,
  options: { snapshotDate?: Date; skip?: number; take?: number } = {}
): Promise<Paged<RegionLowStockRow>> {
  const { skip = 0, take = 100 } = options;

  let snapshotDate = options.snapshotDate;
  if (!snapshotDate) {
    const latest = await prisma.inventoryDaily.findFirst({
      where: { store: { region } },
      orderBy: { snapshotDate: "desc" },
      select: { snapshotDate: true },
    });
    if (!latest) return { rows: [], total: 0, snapshotDate: null };
    snapshotDate = latest.snapshotDate;
  }

  const where: Prisma.InventoryDailyWhereInput = {
    snapshotDate,
    isLowStock: true,
    store: { region },
  };

  const [records, total] = await prisma.$transaction([
    prisma.inventoryDaily.findMany({
      where,
      select: {
        unitsOnHand: true,
        store: { select: { name: true } },
        product: { select: { name: true } },
      },
      // Most urgent first: the emptiest shelves lead the page.
      orderBy: [{ unitsOnHand: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.inventoryDaily.count({ where }),
  ]);

  return {
    snapshotDate,
    total,
    rows: records.map((r) => ({
      storeName: r.store.name,
      productName: r.product.name,
      unitsOnHand: r.unitsOnHand,
    })),
  };
}

// ---------------------------------------------------------------------------
// 3. A product's adjustment history at a store
// ---------------------------------------------------------------------------

export interface AdjustmentHistoryRow {
  adjustedBy: string;
  adjustedAt: Date;
  unitsDelta: number;
  reason: string;
  serialNumber: string;
}

/**
 * One product's adjustment history at one store, newest first.
 *
 * [storeId, productId, adjustedAt] covers the filter and the sort together, so
 * the database walks the tail of a single index range instead of sorting the
 * matched set.
 */
export async function getProductAdjustmentHistory(
  storeId: number,
  productId: number,
  options: { skip?: number; take?: number; since?: Date } = {}
): Promise<Paged<AdjustmentHistoryRow>> {
  const { skip = 0, take = 50, since } = options;

  const where: Prisma.InventoryAdjustmentWhereInput = {
    storeId,
    productId,
    ...(since ? { adjustedAt: { gte: since } } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.inventoryAdjustment.findMany({
      where,
      select: {
        adjustedBy: true,
        adjustedAt: true,
        unitsDelta: true,
        reason: true,
        serialNumber: true,
      },
      orderBy: { adjustedAt: "desc" },
      skip,
      take,
    }),
    prisma.inventoryAdjustment.count({ where }),
  ]);

  return { rows, total, snapshotDate: null };
}

// ---------------------------------------------------------------------------
// 4. Regional summary
// ---------------------------------------------------------------------------

export interface RegionalSummaryRow {
  storeId: number;
  storeKey: string;
  storeName: string;
  totalInventoryValue: Prisma.Decimal;
  productCount: number;
}

/**
 * Total inventory value per store for one snapshot date in one region.
 *
 * The sum is a groupBy, not a findMany-then-reduce: a region-day is hundreds
 * of thousands of rows, and none of them need to cross the wire. Resolving the
 * region's store ids up front (a tiny query on a small table) lets the fact
 * table be hit as `snapshotDate = ? AND storeId IN (...)`, which lands squarely
 * on the [snapshotDate, storeId, productId] unique index.
 */
export async function getRegionalSummary(
  region: string,
  snapshotDate: Date
): Promise<RegionalSummaryRow[]> {
  const stores = await prisma.store.findMany({
    where: { region },
    select: { id: true, storeKey: true, name: true },
  });
  if (stores.length === 0) return [];

  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: {
      snapshotDate,
      storeId: { in: stores.map((s) => s.id) },
    },
    _sum: { inventoryValue: true },
    _count: { _all: true },
  });

  const byStoreId = new Map(grouped.map((g) => [g.storeId, g]));

  return stores
    .map((store) => {
      const agg = byStoreId.get(store.id);
      return {
        storeId: store.id,
        storeKey: store.storeKey,
        storeName: store.name,
        totalInventoryValue: agg?._sum.inventoryValue ?? new Prisma.Decimal(0),
        productCount: agg?._count._all ?? 0,
      };
    })
    .sort((a, b) =>
      b.totalInventoryValue.comparedTo(a.totalInventoryValue)
    );
}
