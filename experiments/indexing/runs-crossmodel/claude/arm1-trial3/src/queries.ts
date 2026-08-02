import { PrismaClient } from "@prisma/client";

/**
 * Query functions for the retail-inventory app. One exported function per page.
 *
 * Every function takes a PrismaClient so callers control the connection
 * lifecycle (and so these are easy to test against a throwaway client).
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
 * Every product held at one store on that store's latest snapshot date.
 *
 * "Latest" is resolved per-store: we find the most recent snapshotDate that
 * has rows for this store, then return every InventoryDaily row on that date.
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
 * By default this looks only at each store's latest snapshot date so the page
 * reflects "currently low stock". Pass { allDates: true } to include every
 * historical low-stock flag instead.
 */
export async function getRegionLowStock(
  prisma: PrismaClient,
  region: string,
  opts: { allDates?: boolean } = {}
): Promise<RegionLowStockRow[]> {
  let latestByStore: Map<number, Date> | null = null;

  if (!opts.allDates) {
    // Resolve the latest snapshot date per store in the region.
    const perStore = await prisma.inventoryDaily.groupBy({
      by: ["storeId"],
      where: { store: { region } },
      _max: { snapshotDate: true },
    });
    latestByStore = new Map(
      perStore
        .filter((g) => g._max.snapshotDate !== null)
        .map((g) => [g.storeId, g._max.snapshotDate as Date])
    );
  }

  const rows = await prisma.inventoryDaily.findMany({
    where: {
      isLowStock: true,
      store: { region },
      ...(latestByStore
        ? {
            OR: Array.from(latestByStore.entries()).map(
              ([storeId, snapshotDate]) => ({ storeId, snapshotDate })
            ),
          }
        : {}),
    },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: [{ store: { name: "asc" } }, { product: { name: "asc" } }],
  });

  // A region with no snapshots at all yields an empty OR array; guard against
  // that returning every low-stock row.
  if (latestByStore && latestByStore.size === 0) return [];

  return rows.map((r) => ({
    storeName: r.store.name,
    productName: r.product.name,
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
 * The adjustment history for one product at one store, newest first,
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

  return rows.map((r) => ({
    adjustedBy: r.adjustedBy,
    adjustedAt: r.adjustedAt,
    unitsDelta: r.unitsDelta,
    reason: r.reason,
    serialNumber: r.serialNumber,
  }));
}

// ---------------------------------------------------------------------------
// Page 4: A regional summary
// ---------------------------------------------------------------------------

export interface RegionSummaryRow {
  storeId: number;
  storeName: string;
  totalInventoryValue: number;
}

/**
 * Total inventory value per store for a given snapshot date, across every
 * store in the region. Stores with no rows on that date are omitted.
 */
export async function getRegionInventorySummary(
  prisma: PrismaClient,
  region: string,
  snapshotDate: Date
): Promise<RegionSummaryRow[]> {
  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { snapshotDate, store: { region } },
    _sum: { inventoryValue: true },
  });

  if (grouped.length === 0) return [];

  // Attach store names in one round-trip.
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
