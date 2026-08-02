/**
 * Page queries for the retail inventory app.
 *
 * These run against several years of daily snapshots for hundreds of stores, so
 * InventoryDaily is the table that decides whether a page loads in 20ms or times
 * out. Two rules are applied throughout:
 *
 *  1. Every filter on InventoryDaily leads with columns that are covered by an
 *     index in prisma/schema.prisma — never a bare scan of the fact table.
 *  2. Region filters are resolved to a concrete list of store ids first (hundreds
 *     of rows at most), so the fact-table query stays an indexed `storeId IN (...)`
 *     lookup instead of a join that the planner may choose to drive from the
 *     wrong side.
 *
 * List-returning functions are paginated. An unbounded result set is the other way
 * these pages fall over in production.
 */

import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

// Prisma 7 connects through a driver adapter rather than a schema-level url.
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
});

export const prisma = new PrismaClient({ adapter });

/** Default page size for list endpoints. */
const DEFAULT_TAKE = 100;
const MAX_TAKE = 1000;

export interface PageOptions {
  /** Rows to return. Clamped to MAX_TAKE. */
  take?: number;
  /** Rows to skip. Prefer cursor pagination for deep paging. */
  skip?: number;
}

function clampTake(take: number | undefined): number {
  if (take === undefined) return DEFAULT_TAKE;
  return Math.max(1, Math.min(take, MAX_TAKE));
}

/* ------------------------------------------------------------------------- */
/* 1. A store's current inventory                                            */
/* ------------------------------------------------------------------------- */

export interface StoreInventoryRow {
  productName: string;
  brandName: string;
  productFamilyName: string;
  unitsOnHand: number;
}

export interface StoreInventoryPage {
  snapshotDate: Date | null;
  rows: StoreInventoryRow[];
}

/**
 * Every product held at one store on that store's latest snapshot date.
 *
 * Two indexed steps. The first reads a single row off the tail of the
 * (storeId, snapshotDate) index to learn the latest date — cheap regardless of
 * how many years of history exist. The second is an equality lookup on that same
 * index prefix, so it touches only that store's rows for that one day.
 *
 * Deliberately not a `groupBy` / `max()` over the store's whole history: that
 * would read every snapshot row the store has ever had.
 */
export async function getStoreCurrentInventory(
  storeId: number,
  options: PageOptions = {}
): Promise<StoreInventoryPage> {
  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });

  if (!latest) return { snapshotDate: null, rows: [] };

  const rows = await prisma.inventoryDaily.findMany({
    where: { storeId, snapshotDate: latest.snapshotDate },
    select: {
      unitsOnHand: true,
      product: {
        select: {
          productName: true,
          brand: { select: { brandName: true } },
          productLine: {
            select: { productFamily: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { productId: 'asc' },
    take: clampTake(options.take),
    skip: options.skip ?? 0,
  });

  return {
    snapshotDate: latest.snapshotDate,
    rows: rows.map((r) => ({
      productName: r.product.productName,
      brandName: r.product.brand.brandName,
      productFamilyName: r.product.productLine.productFamily.name,
      unitsOnHand: r.unitsOnHand,
    })),
  };
}

/* ------------------------------------------------------------------------- */
/* 2. Low stock across a region                                              */
/* ------------------------------------------------------------------------- */

export interface LowStockRow {
  storeName: string;
  productName: string;
  unitsOnHand: number;
}

export interface LowStockPage {
  snapshotDate: Date | null;
  rows: LowStockRow[];
}

/**
 * Every product flagged low stock at any store in a region, on the latest
 * snapshot date available for that region.
 *
 * The region is resolved to store ids up front against Store(region) — a few
 * hundred rows — so the fact-table read is
 * `snapshotDate = ? AND isLowStock = 1 AND storeId IN (...)`, which walks the
 * (snapshotDate, isLowStock, storeId) index. Leading with the date confines the
 * scan to one day out of several years before the flag even matters.
 */
export async function getRegionLowStock(
  region: string,
  options: PageOptions = {}
): Promise<LowStockPage> {
  const stores = await prisma.store.findMany({
    where: { region },
    select: { id: true, name: true },
  });

  if (stores.length === 0) return { snapshotDate: null, rows: [] };

  const storeIds = stores.map((s) => s.id);
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));

  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeId: { in: storeIds } },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });

  if (!latest) return { snapshotDate: null, rows: [] };

  const rows = await prisma.inventoryDaily.findMany({
    where: {
      snapshotDate: latest.snapshotDate,
      isLowStock: true,
      storeId: { in: storeIds },
    },
    select: {
      storeId: true,
      unitsOnHand: true,
      product: { select: { productName: true } },
    },
    orderBy: [{ unitsOnHand: 'asc' }, { id: 'asc' }],
    take: clampTake(options.take),
    skip: options.skip ?? 0,
  });

  return {
    snapshotDate: latest.snapshotDate,
    rows: rows.map((r) => ({
      storeName: storeNameById.get(r.storeId) ?? '',
      productName: r.product.productName,
      unitsOnHand: r.unitsOnHand,
    })),
  };
}

/* ------------------------------------------------------------------------- */
/* 3. A product's adjustment history at a store                              */
/* ------------------------------------------------------------------------- */

export interface AdjustmentRow {
  adjustedAt: Date;
  unitsDelta: number;
  reason: string;
  serialNumber: string;
  adjustedByName: string;
  adjustedByEmail: string;
}

/**
 * One product's adjustment history at one store, newest first.
 *
 * `(storeId, productId, adjustedAt)` is matched left to right: two equality
 * columns then the sort column, so the rows come back in order off the index with
 * no filesort. Paginated — a long-lived store/product pair accumulates a lot of
 * adjustments.
 */
export async function getProductAdjustmentHistory(
  storeId: number,
  productId: number,
  options: PageOptions = {}
): Promise<AdjustmentRow[]> {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: { storeId, productId },
    select: {
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
      adjustedBy: { select: { fullName: true, email: true } },
    },
    orderBy: { adjustedAt: 'desc' },
    take: clampTake(options.take),
    skip: options.skip ?? 0,
  });

  return rows.map((r) => ({
    adjustedAt: r.adjustedAt,
    unitsDelta: r.unitsDelta,
    reason: r.reason,
    serialNumber: r.serialNumber,
    adjustedByName: r.adjustedBy.fullName,
    adjustedByEmail: r.adjustedBy.email,
  }));
}

/* ------------------------------------------------------------------------- */
/* 4. Regional summary                                                       */
/* ------------------------------------------------------------------------- */

export interface RegionalSummaryRow {
  storeId: number;
  storeName: string;
  totalInventoryValue: number;
}

/**
 * Total inventory value per store for one region on a given snapshot date.
 *
 * Aggregated in the database, not in JS: a single day across a region is still
 * hundreds of stores times the full product catalog, and pulling those rows into
 * the process to sum them is the classic way this page dies. `groupBy` on
 * `(snapshotDate, storeId)` reads exactly the slice it sums.
 */
export async function getRegionalInventorySummary(
  region: string,
  snapshotDate: Date
): Promise<RegionalSummaryRow[]> {
  const stores = await prisma.store.findMany({
    where: { region },
    select: { id: true, name: true },
  });

  if (stores.length === 0) return [];

  const storeIds = stores.map((s) => s.id);
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));

  const totals = await prisma.inventoryDaily.groupBy({
    by: ['storeId'],
    where: { snapshotDate, storeId: { in: storeIds } },
    _sum: { inventoryValue: true },
  });

  return totals
    .map((t) => ({
      storeId: t.storeId,
      storeName: storeNameById.get(t.storeId) ?? '',
      totalInventoryValue: t._sum.inventoryValue ?? 0,
    }))
    .sort((a, b) => b.totalInventoryValue - a.totalInventoryValue);
}

export type { Prisma };
