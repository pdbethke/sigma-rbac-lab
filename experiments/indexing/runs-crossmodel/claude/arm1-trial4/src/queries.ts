import { PrismaClient } from "@prisma/client";

/**
 * Queries backing the retail-inventory pages.
 *
 * Every function takes a PrismaClient so callers control the connection
 * lifecycle (and so these are trivial to unit-test against a throwaway db).
 */

// ---------------------------------------------------------------------------
// Page 1: A store's current inventory
// ---------------------------------------------------------------------------

export interface StoreInventoryRow {
  productName: string;
  brandName: string;
  productFamilyName: string;
  unitsOnHand: number;
}

/**
 * Every product held at one store on its latest snapshot date.
 *
 * The "latest snapshot date" is resolved per store: we find the most recent
 * snapshotDate that store has any rows for, then return that day's rows.
 */
export async function getStoreCurrentInventory(
  prisma: PrismaClient,
  storeId: number
): Promise<StoreInventoryRow[]> {
  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  // Store has no inventory rows at all.
  if (!latest) return [];

  const rows = await prisma.inventoryDaily.findMany({
    where: { storeId, snapshotDate: latest.snapshotDate },
    select: {
      unitsOnHand: true,
      product: {
        select: {
          productName: true,
          brand: { select: { brandName: true } },
          productLine: {
            select: {
              productFamily: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { product: { productName: "asc" } },
  });

  return rows.map((r) => ({
    productName: r.product.productName,
    brandName: r.product.brand.brandName,
    productFamilyName: r.product.productLine.productFamily.name,
    unitsOnHand: r.unitsOnHand,
  }));
}

// ---------------------------------------------------------------------------
// Page 2: Low stock across a region
// ---------------------------------------------------------------------------

export interface RegionLowStockRow {
  storeName: string;
  productName: string;
  unitsOnHand: number;
}

/**
 * Every product flagged low stock at any store in a region.
 *
 * By default this looks only at each store's latest snapshot so the page
 * reflects "currently low", not every day a product was ever low. Pass a
 * `snapshotDate` to pin the report to a specific day instead.
 */
export async function getRegionLowStock(
  prisma: PrismaClient,
  region: string,
  snapshotDate?: Date
): Promise<RegionLowStockRow[]> {
  let dateFilter: Date | undefined = snapshotDate;

  // No explicit date: resolve the latest snapshot across the region so the
  // report shows what is low *now* rather than accumulating history.
  if (!dateFilter) {
    const latest = await prisma.inventoryDaily.findFirst({
      where: { isLowStock: true, store: { region } },
      orderBy: { snapshotDate: "desc" },
      select: { snapshotDate: true },
    });
    if (!latest) return [];
    dateFilter = latest.snapshotDate;
  }

  const rows = await prisma.inventoryDaily.findMany({
    where: {
      isLowStock: true,
      snapshotDate: dateFilter,
      store: { region },
    },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { productName: true } },
    },
    orderBy: [{ store: { name: "asc" } }, { product: { productName: "asc" } }],
  });

  return rows.map((r) => ({
    storeName: r.store.name,
    productName: r.product.productName,
    unitsOnHand: r.unitsOnHand,
  }));
}

// ---------------------------------------------------------------------------
// Page 3: A product's adjustment history at a store
// ---------------------------------------------------------------------------

export interface AdjustmentHistoryRow {
  adjustedBy: string;
  adjustedAt: Date;
  unitsDelta: number;
  reason: string;
  serialNumber: string;
}

/**
 * The full adjustment history for one product at one store, newest first,
 * including who made each adjustment.
 */
export async function getProductAdjustmentHistory(
  prisma: PrismaClient,
  storeId: number,
  productId: number
): Promise<AdjustmentHistoryRow[]> {
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

// ---------------------------------------------------------------------------
// Page 4: A regional summary
// ---------------------------------------------------------------------------

export interface RegionalSummaryRow {
  storeId: number;
  storeName: string;
  totalInventoryValue: number;
}

/**
 * Total inventory value per store in a region for a given snapshot date.
 *
 * Stores in the region that have no rows on that date are omitted (they have
 * no value to report for the day).
 */
export async function getRegionalSummary(
  prisma: PrismaClient,
  region: string,
  snapshotDate: Date
): Promise<RegionalSummaryRow[]> {
  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { snapshotDate, store: { region } },
    _sum: { inventoryValue: true },
  });

  if (grouped.length === 0) return [];

  // Resolve store names in one round-trip.
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
    .sort((a, b) => b.totalInventoryValue - a.totalInventoryValue);
}
