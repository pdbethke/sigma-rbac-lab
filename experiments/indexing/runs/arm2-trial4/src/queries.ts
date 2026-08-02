import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Query layer for the retail inventory pages.
 *
 * Every function takes the PrismaClient as its first argument rather than
 * closing over a module-level singleton, so callers control connection
 * lifetime and tests can pass a client bound to a scratch database.
 *
 * Two rules hold throughout, because InventoryDaily is a hundreds-of-millions
 * of rows table in production:
 *
 *  1. No unbounded result sets. Every list-shaped page takes `limit`/`cursor`
 *     and returns a `nextCursor`. A single store on a single day is already
 *     thousands of rows; a region's low-stock list is larger still.
 *  2. No N+1. Related names are pulled with a single nested `select`, or with
 *     one follow-up query over a bounded id set — never one query per row.
 */

/** Default page size for list endpoints. */
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

function clampLimit(limit?: number): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(limit), MAX_LIMIT);
}

/**
 * Snapshot dates are stored as UTC midnight (SQLite has no DATE type). Any
 * caller-supplied date is normalized here so that an equality filter written
 * against, say, `2026-08-02T14:31:00Z` still matches the day's rows.
 */
export function toSnapshotDate(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

export interface Page<T> {
  rows: T[];
  /** Pass back as `cursor` to fetch the next page; null when exhausted. */
  nextCursor: number | null;
}

/* ------------------------------------------------------------------ */
/* 1. A store's current inventory                                      */
/* ------------------------------------------------------------------ */

export interface StoreInventoryRow {
  productId: number;
  sku: string;
  productName: string;
  brandName: string;
  productFamilyName: string;
  unitsOnHand: number;
}

export interface StoreInventoryPage extends Page<StoreInventoryRow> {
  /** The date the rows were actually read from; null if the store has none. */
  snapshotDate: Date | null;
}

/**
 * Returns the latest snapshot date held for one store.
 *
 * Deliberately scoped to a single store: `MAX(snapshotDate)` over the whole
 * table would be a global aggregate, whereas scoped to a store it is the last
 * entry of the `(storeId, snapshotDate, isLowStock)` index — a single B-tree
 * descent regardless of how many years of history exist. Exported because
 * callers frequently want to render "as of <date>" alongside the page.
 */
export async function getLatestSnapshotDateForStore(
  prisma: PrismaClient,
  storeId: number
): Promise<Date | null> {
  const row = await prisma.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  return row?.snapshotDate ?? null;
}

/**
 * Page 1 — every product held at one store on the latest snapshot date.
 *
 * Two queries total: one index-max to resolve the date, one range scan to read
 * the rows. The product hierarchy (brand, line -> family) rides along in the
 * same `select`, so naming a family costs no extra round trip per product.
 *
 * Pass `snapshotDate` to pin a historical day instead of the latest.
 */
export async function getStoreCurrentInventory(
  prisma: PrismaClient,
  params: {
    storeId: number;
    snapshotDate?: Date;
    limit?: number;
    cursor?: number | null;
  }
): Promise<StoreInventoryPage> {
  const { storeId, cursor } = params;
  const take = clampLimit(params.limit);

  const snapshotDate = params.snapshotDate
    ? toSnapshotDate(params.snapshotDate)
    : await getLatestSnapshotDateForStore(prisma, storeId);

  if (snapshotDate === null) {
    return { rows: [], nextCursor: null, snapshotDate: null };
  }

  const records = await prisma.inventoryDaily.findMany({
    where: { storeId, snapshotDate },
    // Order by the index's own trailing column so the page is a contiguous
    // range read and the cursor is stable across pages.
    orderBy: { productId: "asc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      unitsOnHand: true,
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          brand: { select: { name: true } },
          productLine: {
            select: { productFamily: { select: { name: true } } },
          },
        },
      },
    },
  });

  const hasMore = records.length > take;
  const page = hasMore ? records.slice(0, take) : records;

  return {
    rows: page.map((r) => ({
      productId: r.product.id,
      sku: r.product.sku,
      productName: r.product.name,
      brandName: r.product.brand.name,
      productFamilyName: r.product.productLine.productFamily.name,
      unitsOnHand: r.unitsOnHand,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    snapshotDate,
  };
}

/* ------------------------------------------------------------------ */
/* 2. Low stock across a region                                        */
/* ------------------------------------------------------------------ */

export interface RegionLowStockRow {
  storeId: number;
  storeName: string;
  productId: number;
  productName: string;
  unitsOnHand: number;
}

export interface RegionLowStockPage extends Page<RegionLowStockRow> {
  snapshotDate: Date | null;
}

/**
 * Page 2 — every product flagged low stock at any store in a region.
 *
 * Without a date this is a scan of the region's entire history, so it defaults
 * to the most recent snapshot date the chain holds. The region filter is
 * expressed as `storeId in (...)` rather than a relation filter on
 * `store.region`: the store list is a few hundred rows at most, and the
 * explicit IN lets the query planner drive the `(storeId, snapshotDate,
 * isLowStock)` index directly instead of joining first and filtering after.
 */
export async function getRegionLowStock(
  prisma: PrismaClient,
  params: {
    region: string;
    snapshotDate?: Date;
    limit?: number;
    cursor?: number | null;
  }
): Promise<RegionLowStockPage> {
  const { region, cursor } = params;
  const take = clampLimit(params.limit);

  const stores = await prisma.store.findMany({
    where: { region },
    select: { id: true, name: true },
  });

  if (stores.length === 0) {
    return { rows: [], nextCursor: null, snapshotDate: null };
  }

  const storeIds = stores.map((s) => s.id);
  const storeNames = new Map(stores.map((s) => [s.id, s.name]));

  let snapshotDate: Date | null;
  if (params.snapshotDate) {
    snapshotDate = toSnapshotDate(params.snapshotDate);
  } else {
    const latest = await prisma.inventoryDaily.findFirst({
      where: { storeId: { in: storeIds } },
      orderBy: { snapshotDate: "desc" },
      select: { snapshotDate: true },
    });
    snapshotDate = latest?.snapshotDate ?? null;
  }

  if (snapshotDate === null) {
    return { rows: [], nextCursor: null, snapshotDate: null };
  }

  const records = await prisma.inventoryDaily.findMany({
    where: {
      storeId: { in: storeIds },
      snapshotDate,
      isLowStock: true,
    },
    orderBy: [{ storeId: "asc" }, { productId: "asc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      storeId: true,
      unitsOnHand: true,
      product: { select: { id: true, name: true } },
    },
  });

  const hasMore = records.length > take;
  const page = hasMore ? records.slice(0, take) : records;

  return {
    rows: page.map((r) => ({
      storeId: r.storeId,
      // Resolved from the store list already in hand — no per-row join.
      storeName: storeNames.get(r.storeId) ?? "",
      productId: r.product.id,
      productName: r.product.name,
      unitsOnHand: r.unitsOnHand,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    snapshotDate,
  };
}

/* ------------------------------------------------------------------ */
/* 3. A product's adjustment history at a store                        */
/* ------------------------------------------------------------------ */

export interface AdjustmentRow {
  id: number;
  adjustedBy: string;
  adjustedAt: Date;
  unitsDelta: number;
  reason: string;
  serialNumber: string;
}

/**
 * Page 3 — the adjustment history for one product at one store, newest first.
 *
 * Served entirely by the `(storeId, productId, adjustedAt)` index: the filter
 * is the leading two columns and the sort is the third, so there is no sort
 * step. Paged because a long-lived SKU at a busy store accumulates thousands
 * of adjustments.
 */
export async function getProductAdjustmentHistory(
  prisma: PrismaClient,
  params: {
    storeId: number;
    productId: number;
    limit?: number;
    cursor?: number | null;
  }
): Promise<Page<AdjustmentRow>> {
  const { storeId, productId, cursor } = params;
  const take = clampLimit(params.limit);

  const records = await prisma.inventoryAdjustment.findMany({
    where: { storeId, productId },
    orderBy: [{ adjustedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
  });

  const hasMore = records.length > take;
  const page = hasMore ? records.slice(0, take) : records;

  return {
    rows: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Regional summary                                                 */
/* ------------------------------------------------------------------ */

export interface RegionalStoreValueRow {
  storeId: number;
  storeKey: string;
  storeName: string;
  totalInventoryValue: Prisma.Decimal;
  productCount: number;
}

/**
 * Page 4 — total inventory value per store, for one region on one date.
 *
 * The sum is pushed into the database as a `groupBy`, so the day's rows for
 * the region are aggregated in the engine and only one row per store crosses
 * the wire. Reading the rows and summing in JavaScript would move millions of
 * rows per request.
 *
 * Not paged: the result is one row per store in the region — bounded by the
 * store count, not by the fact table.
 */
export async function getRegionalInventoryValueSummary(
  prisma: PrismaClient,
  params: { region: string; snapshotDate: Date }
): Promise<{ snapshotDate: Date; rows: RegionalStoreValueRow[] }> {
  const snapshotDate = toSnapshotDate(params.snapshotDate);

  const stores = await prisma.store.findMany({
    where: { region: params.region },
    select: { id: true, storeKey: true, name: true },
  });

  if (stores.length === 0) {
    return { snapshotDate, rows: [] };
  }

  const storeIds = stores.map((s) => s.id);

  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { snapshotDate, storeId: { in: storeIds } },
    _sum: { inventoryValue: true },
    _count: { _all: true },
  });

  const totals = new Map(grouped.map((g) => [g.storeId, g]));

  // Every store in the region appears, including those with no rows on the
  // date — a store missing from the snapshot load is a signal, not a gap to
  // hide by omitting the row.
  return {
    snapshotDate,
    rows: stores.map((s) => {
      const g = totals.get(s.id);
      return {
        storeId: s.id,
        storeKey: s.storeKey,
        storeName: s.name,
        totalInventoryValue:
          g?._sum.inventoryValue ?? new Prisma.Decimal(0),
        productCount: g?._count._all ?? 0,
      };
    }),
  };
}
