/**
 * One function per page in the inventory app.
 *
 * These run against several years of daily snapshots for hundreds of stores, so
 * inventory_daily is the table that matters: it holds roughly
 * (days x stores x products) rows. Every function below is written to hit one of
 * the composite indexes declared in prisma/schema.prisma rather than to filter in
 * application code, and the two functions that can return an unbounded number of
 * rows are paginated by default.
 */

import { Prisma } from "./generated/prisma/client.js";
import { prisma } from "./client.js";

/** Default page size for the list pages. Callers can override. */
const DEFAULT_PAGE_SIZE = 200;

export interface Page {
  /** Max rows to return. */
  take?: number;
  /** `id` of the last row on the previous page. */
  cursorId?: number;
}

function pageArgs(page: Page = {}): {
  take: number;
  skip?: number;
  cursor?: { id: number };
} {
  const take = page.take ?? DEFAULT_PAGE_SIZE;
  return page.cursorId === undefined
    ? { take }
    : { take, skip: 1, cursor: { id: page.cursorId } };
}

/**
 * The latest snapshot date on record, optionally restricted to a set of stores.
 *
 * Reads a single row off the tail of an index (`[snapshotDate, storeId]` for the
 * chain-wide case, `[storeId, snapshotDate, ...]` per store), never a scan.
 */
export async function latestSnapshotDate(
  storeIds?: number[],
): Promise<Date | null> {
  const row = await prisma.inventoryDaily.findFirst({
    where: storeIds ? { storeId: { in: storeIds } } : undefined,
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  return row?.snapshotDate ?? null;
}

/* ------------------------------------------------------------------ */
/* 1. A store's current inventory                                      */
/* ------------------------------------------------------------------ */

export interface StoreInventoryRow {
  inventoryDailyId: number;
  productId: number;
  sku: string;
  productName: string;
  brandName: string;
  productFamilyName: string;
  unitsOnHand: number;
}

export interface StoreCurrentInventory {
  storeId: number;
  snapshotDate: Date | null;
  rows: StoreInventoryRow[];
}

/**
 * Every product held at one store on that store's latest snapshot date.
 *
 * Two round trips, both index-served:
 *   1. latest snapshot date for the store — tail of `[storeId, snapshotDate, productId]`
 *   2. the day's rows — a contiguous range of that same index
 * The product/brand/family names come along as a join rather than a per-row lookup.
 */
export async function getStoreCurrentInventory(
  storeId: number,
  page: Page = {},
): Promise<StoreCurrentInventory> {
  const snapshotDate = await latestSnapshotDate([storeId]);
  if (snapshotDate === null) {
    return { storeId, snapshotDate: null, rows: [] };
  }

  const rows = await prisma.inventoryDaily.findMany({
    where: { storeId, snapshotDate },
    ...pageArgs(page),
    orderBy: { id: "asc" },
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

  return {
    storeId,
    snapshotDate,
    rows: rows.map((r) => ({
      inventoryDailyId: r.id,
      productId: r.product.id,
      sku: r.product.sku,
      productName: r.product.name,
      brandName: r.product.brand.name,
      productFamilyName: r.product.productLine.productFamily.name,
      unitsOnHand: r.unitsOnHand,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 2. Low stock across a region                                        */
/* ------------------------------------------------------------------ */

export interface RegionLowStockRow {
  inventoryDailyId: number;
  storeId: number;
  storeName: string;
  productId: number;
  sku: string;
  productName: string;
  unitsOnHand: number;
  reorderPoint: number;
}

export interface RegionLowStock {
  region: string;
  snapshotDate: Date | null;
  rows: RegionLowStockRow[];
}

/**
 * Every product flagged low stock at any store in a region, on one snapshot date
 * (the region's latest by default).
 *
 * The region is resolved to store ids first — `store(region)` is indexed and the
 * list is a few hundred entries at most — so the inventory read becomes an
 * `IN (...)` over `[storeId, snapshotDate, isLowStock]` instead of a join-then-filter
 * across the whole fact table. Pinning a single snapshot date is what keeps this
 * bounded; without it the query spans years of history per store.
 */
export async function getRegionLowStock(
  region: string,
  options: Page & { snapshotDate?: Date } = {},
): Promise<RegionLowStock> {
  const stores = await prisma.store.findMany({
    where: { region },
    select: { id: true, name: true },
  });
  if (stores.length === 0) {
    return { region, snapshotDate: options.snapshotDate ?? null, rows: [] };
  }

  const storeIds = stores.map((s) => s.id);
  const storeNames = new Map(stores.map((s) => [s.id, s.name]));

  const snapshotDate =
    options.snapshotDate ?? (await latestSnapshotDate(storeIds));
  if (snapshotDate === null) {
    return { region, snapshotDate: null, rows: [] };
  }

  const rows = await prisma.inventoryDaily.findMany({
    where: { storeId: { in: storeIds }, snapshotDate, isLowStock: true },
    ...pageArgs(options),
    orderBy: { id: "asc" },
    select: {
      id: true,
      storeId: true,
      unitsOnHand: true,
      reorderPoint: true,
      product: { select: { id: true, sku: true, name: true } },
    },
  });

  return {
    region,
    snapshotDate,
    rows: rows.map((r) => ({
      inventoryDailyId: r.id,
      storeId: r.storeId,
      storeName: storeNames.get(r.storeId) ?? "",
      productId: r.product.id,
      sku: r.product.sku,
      productName: r.product.name,
      unitsOnHand: r.unitsOnHand,
      reorderPoint: r.reorderPoint,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 3. A product's adjustment history at a store                        */
/* ------------------------------------------------------------------ */

export interface AdjustmentRow {
  id: number;
  adjustedAt: Date;
  unitsDelta: number;
  reason: string;
  serialNumber: string;
  adjusterId: number;
  adjusterName: string;
  adjusterEmail: string;
}

/**
 * One product's adjustment history at one store, newest first.
 *
 * `[storeId, productId, adjustedAt]` serves the filter and the ordering in a
 * single index range, so paging back through a long history stays flat.
 */
export async function getProductAdjustmentHistory(
  storeId: number,
  productId: number,
  page: Page = {},
): Promise<AdjustmentRow[]> {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: { storeId, productId },
    ...pageArgs(page),
    orderBy: [{ adjustedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
      adjuster: { select: { id: true, name: true, email: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    adjustedAt: r.adjustedAt,
    unitsDelta: r.unitsDelta,
    reason: r.reason,
    serialNumber: r.serialNumber,
    adjusterId: r.adjuster.id,
    adjusterName: r.adjuster.name,
    adjusterEmail: r.adjuster.email,
  }));
}

/* ------------------------------------------------------------------ */
/* 4. Regional summary: inventory value per store for a snapshot date  */
/* ------------------------------------------------------------------ */

export interface StoreInventoryValue {
  storeId: number;
  storeKey: string;
  storeName: string;
  city: string;
  state: string;
  tier: string;
  totalInventoryValue: Prisma.Decimal;
  productCount: number;
}

/**
 * Total inventory value per store for one snapshot date across a region.
 *
 * Aggregated in the database (`GROUP BY store_id` with `SUM`) rather than by
 * pulling the day's rows into Node — for a few hundred stores that is the
 * difference between a few hundred result rows and a few million transferred ones.
 * The scan is confined to one date's slice per store by
 * `[storeId, snapshotDate, ...]`; store attributes are attached afterwards from the
 * small store table.
 */
export async function getRegionalInventoryValue(
  region: string,
  snapshotDate: Date,
): Promise<StoreInventoryValue[]> {
  const stores = await prisma.store.findMany({
    where: { region },
    select: {
      id: true,
      storeKey: true,
      name: true,
      city: true,
      state: true,
      tier: true,
    },
  });
  if (stores.length === 0) return [];

  const storeIds = stores.map((s) => s.id);

  const totals = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { storeId: { in: storeIds }, snapshotDate },
    _sum: { inventoryValue: true },
    _count: { _all: true },
  });

  const totalsByStore = new Map(totals.map((t) => [t.storeId, t]));

  return stores
    .map((s) => {
      const t = totalsByStore.get(s.id);
      return {
        storeId: s.id,
        storeKey: s.storeKey,
        storeName: s.name,
        city: s.city,
        state: s.state,
        tier: s.tier,
        totalInventoryValue:
          t?._sum.inventoryValue ?? new Prisma.Decimal(0),
        productCount: t?._count._all ?? 0,
      };
    })
    .sort((a, b) =>
      b.totalInventoryValue.comparedTo(a.totalInventoryValue),
    );
}
