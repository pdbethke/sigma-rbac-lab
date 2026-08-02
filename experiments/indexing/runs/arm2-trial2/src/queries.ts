import { Prisma } from "./generated/prisma/client.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import { prisma as defaultClient } from "./client.js";

/**
 * One exported function per page.
 *
 * Two rules hold across all four, because InventoryDaily is a
 * hundreds-of-millions-of-rows table:
 *
 *  1. Every read of InventoryDaily is pinned to a single snapshot date. A page
 *     that says "current" means one date, not "scan the history and take the
 *     newest per row" — the latter reads years of data to return one day of it.
 *  2. Every list is paginated. There is no page here whose result set is
 *     bounded by anything except the caller's page size.
 */

export interface Page {
  /** Rows to return. Callers should keep this at page size, not "everything". */
  take?: number;
  skip?: number;
}

const DEFAULT_TAKE = 100;
const MAX_TAKE = 1000;

function pageArgs({ take = DEFAULT_TAKE, skip = 0 }: Page = {}) {
  return { take: Math.min(Math.max(take, 1), MAX_TAKE), skip: Math.max(skip, 0) };
}

/* ------------------------------------------------------------------ */
/* 1. A store's current inventory                                      */
/* ------------------------------------------------------------------ */

export interface StoreInventoryRow {
  sku: string;
  productName: string;
  brandName: string;
  productFamilyName: string;
  unitsOnHand: number;
}

export interface StoreInventoryResult {
  snapshotDate: Date | null;
  rows: StoreInventoryRow[];
}

/**
 * Every product held at one store on the latest snapshot date.
 *
 * Two statements, both index-only in their access path:
 *  - the latest date for this store is the last entry under the storeId prefix
 *    of (storeId, snapshotDate, isLowStock), so it is a one-row backwards seek,
 *    not a max() over the store's history;
 *  - the rows themselves are a range scan of that same index pinned to
 *    (storeId, snapshotDate).
 *
 * The product/brand/family names come from an `include`, which Prisma resolves
 * as batched `IN` lookups against the small dimension tables — bounded by the
 * page size, not by the size of the snapshot table.
 */
export async function getStoreCurrentInventory(
  storeId: number,
  page: Page = {},
  client: PrismaClient | Prisma.TransactionClient = defaultClient,
): Promise<StoreInventoryResult> {
  const latest = await client.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  if (!latest) return { snapshotDate: null, rows: [] };

  const rows = await client.inventoryDaily.findMany({
    where: { storeId, snapshotDate: latest.snapshotDate },
    select: {
      unitsOnHand: true,
      product: {
        select: {
          sku: true,
          name: true,
          brand: { select: { brandName: true } },
          productLine: { select: { productFamily: { select: { name: true } } } },
        },
      },
    },
    orderBy: { productId: "asc" },
    ...pageArgs(page),
  });

  return {
    snapshotDate: latest.snapshotDate,
    rows: rows.map((r) => ({
      sku: r.product.sku,
      productName: r.product.name,
      brandName: r.product.brand.brandName,
      productFamilyName: r.product.productLine.productFamily.name,
      unitsOnHand: r.unitsOnHand,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 2. Low stock across a region                                        */
/* ------------------------------------------------------------------ */

export interface RegionLowStockRow {
  storeName: string;
  sku: string;
  productName: string;
  unitsOnHand: number;
}

export interface RegionLowStockResult {
  snapshotDate: Date | null;
  rows: RegionLowStockRow[];
}

/**
 * Every product flagged low stock at any store in a region.
 *
 * The region is resolved to its store ids first (index on Store.region), and
 * the snapshot rows are then read as one index range per store under
 * (storeId, snapshotDate, isLowStock). Filtering on the third column of that
 * index means the flag is tested inside the index; the engine never reads a
 * healthy-stock row off disk to throw it away, which matters because the
 * low-stock rows are a small fraction of the day.
 *
 * `snapshotDate` defaults to the newest date present in the region. It is a
 * parameter rather than a lookup per store so that one page renders one
 * comparable day across the region — a store whose nightly load has not landed
 * yet shows no rows rather than yesterday's rows mixed into today's.
 */
export async function getRegionLowStock(
  region: string,
  opts: Page & { snapshotDate?: Date } = {},
  client: PrismaClient | Prisma.TransactionClient = defaultClient,
): Promise<RegionLowStockResult> {
  const stores = await client.store.findMany({
    where: { region },
    select: { id: true },
  });
  if (stores.length === 0) return { snapshotDate: null, rows: [] };

  const storeIds = stores.map((s) => s.id);

  let snapshotDate = opts.snapshotDate ?? null;
  if (!snapshotDate) {
    const latest = await client.inventoryDaily.findFirst({
      where: { storeId: { in: storeIds } },
      orderBy: { snapshotDate: "desc" },
      select: { snapshotDate: true },
    });
    if (!latest) return { snapshotDate: null, rows: [] };
    snapshotDate = latest.snapshotDate;
  }

  const rows = await client.inventoryDaily.findMany({
    where: { storeId: { in: storeIds }, snapshotDate, isLowStock: true },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { sku: true, name: true } },
    },
    orderBy: [{ storeId: "asc" }, { productId: "asc" }],
    ...pageArgs(opts),
  });

  return {
    snapshotDate,
    rows: rows.map((r) => ({
      storeName: r.store.name,
      sku: r.product.sku,
      productName: r.product.name,
      unitsOnHand: r.unitsOnHand,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 3. A product's adjustment history at a store                        */
/* ------------------------------------------------------------------ */

export interface AdjustmentRow {
  serialNumber: string;
  adjustedAt: Date;
  adjustedBy: string;
  unitsDelta: number;
  reason: string;
}

/**
 * Adjustment history for one product at one store, newest first.
 *
 * (storeId, productId, adjustedAt) covers the filter and the sort, so this is
 * a single backwards range scan with no sort step — the page size bounds the
 * work regardless of how many years of adjustments the pair has accumulated.
 */
export async function getProductAdjustmentHistoryAtStore(
  storeId: number,
  productId: number,
  page: Page = {},
  client: PrismaClient | Prisma.TransactionClient = defaultClient,
): Promise<AdjustmentRow[]> {
  return client.inventoryAdjustment.findMany({
    where: { storeId, productId },
    select: {
      serialNumber: true,
      adjustedAt: true,
      adjustedBy: true,
      unitsDelta: true,
      reason: true,
    },
    orderBy: { adjustedAt: "desc" },
    ...pageArgs(page),
  });
}

/* ------------------------------------------------------------------ */
/* 4. Regional summary                                                 */
/* ------------------------------------------------------------------ */

export interface RegionalSummaryRow {
  storeId: number;
  storeKey: string;
  storeName: string;
  /** Decimal, not number — inventory value is money and this is a sum. */
  totalInventoryValue: Prisma.Decimal;
  productCount: number;
}

/**
 * Total inventory value per store, for one region on one snapshot date.
 *
 * The aggregate is pushed into the database — one grouped scan of the
 * (snapshotDate, storeId, productId) unique index, whose leading two columns
 * are exactly this filter, so it touches one date's slice for the region's
 * stores and nothing else. The alternative, pulling rows out and summing in
 * JS, would move a store-day of rows per store across the wire to produce one
 * number each.
 *
 * Not paginated: the result is one row per store in the region, hundreds at
 * the chain's full size.
 */
export async function getRegionalInventoryValueSummary(
  region: string,
  snapshotDate: Date,
  client: PrismaClient | Prisma.TransactionClient = defaultClient,
): Promise<RegionalSummaryRow[]> {
  const stores = await client.store.findMany({
    where: { region },
    select: { id: true, storeKey: true, name: true },
    orderBy: { storeKey: "asc" },
  });
  if (stores.length === 0) return [];

  const grouped = await client.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { snapshotDate, storeId: { in: stores.map((s) => s.id) } },
    _sum: { inventoryValue: true },
    _count: { _all: true },
  });

  const byStore = new Map(grouped.map((g) => [g.storeId, g]));

  return stores.map((s) => {
    const g = byStore.get(s.id);
    return {
      storeId: s.id,
      storeKey: s.storeKey,
      storeName: s.name,
      totalInventoryValue: g?._sum.inventoryValue ?? new Prisma.Decimal(0),
      productCount: g?._count._all ?? 0,
    };
  });
}
