import { PrismaClient } from "@prisma/client";

/**
 * Query layer for the retail-inventory pages.
 *
 * All functions take a PrismaClient so callers control the connection /
 * transaction lifecycle. Each function maps 1:1 to one page in the app.
 *
 * Performance context: InventoryDaily holds several years of daily snapshots
 * for hundreds of stores, so every query below is written to hit an index
 * defined in schema.prisma rather than scan the table. See the notes on each
 * function for which index it relies on.
 */

export const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Return shapes (kept explicit so page code has a stable contract).
// ---------------------------------------------------------------------------

export interface StoreInventoryRow {
  productName: string;
  brandName: string;
  productFamilyName: string;
  unitsOnHand: number;
}

export interface RegionLowStockRow {
  storeName: string;
  productName: string;
  unitsOnHand: number;
}

export interface AdjustmentHistoryRow {
  adjustedBy: string;
  adjustedAt: Date;
  unitsDelta: number;
  reason: string;
  serialNumber: string;
}

export interface RegionalSummaryRow {
  storeId: number;
  storeName: string;
  totalInventoryValue: number;
}

// ---------------------------------------------------------------------------
// Small helper: the latest snapshot date in the table.
//
// The app is "current inventory" oriented, so several pages key off the most
// recent snapshot. Finding it is a single index-backed lookup (the
// snapshotDate-leading unique index gives MAX(snapshotDate) from the b-tree
// tail without a scan).
// ---------------------------------------------------------------------------

async function latestSnapshotDate(
  client: PrismaClient
): Promise<Date | null> {
  const row = await client.inventoryDaily.findFirst({
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  return row?.snapshotDate ?? null;
}

// ---------------------------------------------------------------------------
// Page 1: A store's current inventory.
//
// Every product held at one store on the latest snapshot date.
//
// Index path: we take the store's own most-recent snapshot date via the
// (storeId, snapshotDate) index, then read that store+date slice from the same
// index. Product name / brand / family come from PK-joined relations.
// ---------------------------------------------------------------------------

export async function getStoreCurrentInventory(
  storeId: number,
  client: PrismaClient = prisma
): Promise<StoreInventoryRow[]> {
  // Most recent snapshot date for THIS store (index seek + tail read).
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
// Page 2: Low stock across a region.
//
// Every product flagged low stock at any store in a region, on the latest
// snapshot date (current low-stock status).
//
// Index path: snapshotDate-leading unique index narrows to the latest date;
// the store relation filter uses Store(region). We restrict to the latest
// snapshot so the page shows current low stock, not historical flags.
// ---------------------------------------------------------------------------

export async function getRegionLowStock(
  region: string,
  client: PrismaClient = prisma
): Promise<RegionLowStockRow[]> {
  const latest = await latestSnapshotDate(client);
  if (!latest) return [];

  const rows = await client.inventoryDaily.findMany({
    where: {
      snapshotDate: latest,
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

// ---------------------------------------------------------------------------
// Page 3: A product's adjustment history at a store.
//
// Returns who made each adjustment (plus the surrounding detail), newest first.
//
// Index path: the (storeId, productId, adjustedAt) index gives an exact seek
// on store+product and returns rows already ordered by adjustedAt.
// ---------------------------------------------------------------------------

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
// Page 4: A regional summary.
//
// Total inventory value per store for a given snapshot date.
//
// Index path: groupBy filters on snapshotDate (unique index prefix) plus the
// Store(region) relation, and aggregates inventoryValue in the DB. Store names
// are looked up once and merged in memory (no per-row N+1).
// ---------------------------------------------------------------------------

export async function getRegionalSummary(
  region: string,
  snapshotDate: Date,
  client: PrismaClient = prisma
): Promise<RegionalSummaryRow[]> {
  const grouped = await client.inventoryDaily.groupBy({
    by: ["storeId"],
    where: {
      snapshotDate,
      store: { region },
    },
    _sum: { inventoryValue: true },
  });

  if (grouped.length === 0) return [];

  const stores = await client.store.findMany({
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
