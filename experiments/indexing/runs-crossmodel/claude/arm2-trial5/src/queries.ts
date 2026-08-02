import { PrismaClient } from "@prisma/client";

/**
 * Queries backing the four inventory pages.
 *
 * A single PrismaClient is shared across the module (Prisma pools connections
 * internally; constructing one per call is a common production footgun). Each
 * function maps to exactly one page and returns only the columns that page
 * renders. The access paths are chosen to hit the indexes declared in
 * prisma/schema.prisma — see the comments on each function.
 */
export const prisma = new PrismaClient();

/* ------------------------------------------------------------------ */
/* Page 1: A store's current inventory                                 */
/* ------------------------------------------------------------------ */

export interface StoreInventoryRow {
  productName: string;
  brandName: string;
  productFamilyName: string;
  unitsOnHand: number;
}

/**
 * Every product held at one store on that store's latest snapshot date.
 *
 * Two-step so we never scan the whole snapshot history: first find the store's
 * most recent snapshotDate (index [storeId, snapshotDate], one row), then read
 * that store/date slice (same index) joining up the product hierarchy for the
 * family name.
 */
export async function getStoreCurrentInventory(
  storeId: number,
): Promise<StoreInventoryRow[]> {
  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  if (!latest) return [];

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

  return rows.map((r) => ({
    productName: r.product.name,
    brandName: r.product.brand.name,
    productFamilyName: r.product.productLine.productFamily.name,
    unitsOnHand: r.unitsOnHand,
  }));
}

/* ------------------------------------------------------------------ */
/* Page 2: Low stock across a region                                   */
/* ------------------------------------------------------------------ */

export interface LowStockRow {
  storeName: string;
  productName: string;
  unitsOnHand: number;
}

/**
 * Every product flagged low stock at any store in a region, on the latest
 * snapshot date (i.e. currently low, not low at some point in history — over
 * years of snapshots the historical set would be meaningless).
 *
 * Pin the current date once (index [snapshotDate, isLowStock]), then filter to
 * low-stock rows whose store is in the region (Store.region index on the join).
 */
export async function getLowStockInRegion(
  region: string,
): Promise<LowStockRow[]> {
  const latest = await prisma.inventoryDaily.findFirst({
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  if (!latest) return [];

  const rows = await prisma.inventoryDaily.findMany({
    where: {
      snapshotDate: latest.snapshotDate,
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

  return rows.map((r) => ({
    storeName: r.store.name,
    productName: r.product.name,
    unitsOnHand: r.unitsOnHand,
  }));
}

/* ------------------------------------------------------------------ */
/* Page 3: A product's adjustment history at a store                   */
/* ------------------------------------------------------------------ */

export interface AdjustmentHistoryRow {
  adjustedBy: string;
  adjustedAt: Date;
  unitsDelta: number;
  reason: string;
  serialNumber: string;
}

/**
 * Full adjustment history for one product at one store, newest first,
 * including who made each adjustment.
 *
 * Exact match on (storeId, productId) with a time-ordered scan — served
 * end-to-end by the [storeId, productId, adjustedAt] index.
 */
export async function getProductAdjustmentHistory(
  storeId: number,
  productId: number,
): Promise<AdjustmentHistoryRow[]> {
  return prisma.inventoryAdjustment.findMany({
    where: { storeId, productId },
    orderBy: { adjustedAt: "desc" },
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
  });
}

/* ------------------------------------------------------------------ */
/* Page 4: A regional summary                                          */
/* ------------------------------------------------------------------ */

export interface RegionalSummaryRow {
  storeId: number;
  storeName: string;
  totalInventoryValue: number;
}

/**
 * Total inventory value per store, for the stores in a region, on a given
 * snapshot date.
 *
 * Resolve the region's stores first (Store.region index), then aggregate the
 * single-date slice grouped by store. The groupBy is served by the
 * [snapshotDate, storeId, productId] unique index (date + store prefix), so
 * only that one day's rows for those stores are touched.
 */
export async function getRegionalSummary(
  region: string,
  snapshotDate: Date,
): Promise<RegionalSummaryRow[]> {
  const stores = await prisma.store.findMany({
    where: { region },
    select: { id: true, name: true },
  });

  if (stores.length === 0) return [];

  const nameById = new Map(stores.map((s) => [s.id, s.name]));

  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: {
      snapshotDate,
      storeId: { in: stores.map((s) => s.id) },
    },
    _sum: { inventoryValue: true },
  });

  return grouped
    .map((g) => ({
      storeId: g.storeId,
      storeName: nameById.get(g.storeId) ?? "",
      totalInventoryValue: g._sum.inventoryValue ?? 0,
    }))
    .sort((a, b) => b.totalInventoryValue - a.totalInventoryValue);
}
