import { Prisma, PrismaClient } from "@prisma/client";

/**
 * A single shared client. Callers may also pass their own client to each
 * function (useful for tests / transactions); it defaults to this one.
 */
export const prisma = new PrismaClient();

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
 * The "latest snapshot date" is resolved per store, so a store that hasn't
 * reported today still returns its most recent snapshot.
 */
export async function getStoreCurrentInventory(
  storeId: number,
  client: PrismaClient = prisma
): Promise<StoreInventoryRow[]> {
  // Find the store's most recent snapshot date.
  const latest = await client.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  if (!latest) return [];

  const rows = await client.inventoryDaily.findMany({
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
 * Every product flagged low stock at any store in a region, on each store's
 * latest snapshot date.
 */
export async function getLowStockAcrossRegion(
  region: string,
  client: PrismaClient = prisma
): Promise<RegionLowStockRow[]> {
  // Latest snapshot date per store in the region.
  const latestPerStore = await client.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { store: { region } },
    _max: { snapshotDate: true },
  });

  if (latestPerStore.length === 0) return [];

  // Match each store to its own latest snapshot, and only low-stock rows.
  const rows = await client.inventoryDaily.findMany({
    where: {
      isLowStock: true,
      OR: latestPerStore.map((s) => ({
        storeId: s.storeId,
        snapshotDate: s._max.snapshotDate ?? undefined,
      })),
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
  storeId: number,
  productId: number,
  client: PrismaClient = prisma
): Promise<AdjustmentHistoryRow[]> {
  const rows = await client.inventoryAdjustment.findMany({
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

  return rows;
}

// ---------------------------------------------------------------------------
// Page 4: Regional summary — total inventory value per store
// ---------------------------------------------------------------------------

export interface RegionalSummaryRow {
  storeId: number;
  storeName: string;
  totalInventoryValue: Prisma.Decimal;
}

/**
 * Total inventory value per store in a region for a given snapshot date.
 * Stores in the region with no rows on that date are omitted.
 */
export async function getRegionalSummary(
  region: string,
  snapshotDate: Date,
  client: PrismaClient = prisma
): Promise<RegionalSummaryRow[]> {
  const grouped = await client.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { snapshotDate, store: { region } },
    _sum: { inventoryValue: true },
  });

  if (grouped.length === 0) return [];

  // Attach store names.
  const stores = await client.store.findMany({
    where: { id: { in: grouped.map((g) => g.storeId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(stores.map((s) => [s.id, s.name]));

  return grouped
    .map((g) => ({
      storeId: g.storeId,
      storeName: nameById.get(g.storeId) ?? "",
      totalInventoryValue: g._sum.inventoryValue ?? new Prisma.Decimal(0),
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));
}
