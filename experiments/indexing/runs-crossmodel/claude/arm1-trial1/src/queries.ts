import { PrismaClient } from "@prisma/client";

/**
 * Shared Prisma client. Each page function takes the client as its first
 * argument so the queries stay easy to test and reuse; `prisma` is exported for
 * callers that just want a ready-made instance.
 */
export const prisma = new PrismaClient();

/* ------------------------------------------------------------------ *
 * Page 1: A store's current inventory
 *
 * Every product held at one store on that store's latest snapshot date.
 * Returns product name, brand name, product family name and units on hand.
 * ------------------------------------------------------------------ */

export interface StoreInventoryRow {
  productName: string;
  brandName: string;
  productFamilyName: string;
  unitsOnHand: number;
}

export async function getStoreCurrentInventory(
  client: PrismaClient,
  storeId: number,
): Promise<StoreInventoryRow[]> {
  // Latest snapshot date that this store actually has data for.
  // Served by @@index([storeId, snapshotDate]).
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
          productName: true,
          brand: { select: { brandName: true } },
          productLine: {
            select: { productFamily: { select: { name: true } } },
          },
        },
      },
    },
  });

  return rows.map((r) => ({
    productName: r.product.productName,
    brandName: r.product.brand.brandName,
    productFamilyName: r.product.productLine.productFamily.name,
    unitsOnHand: r.unitsOnHand,
  }));
}

/* ------------------------------------------------------------------ *
 * Page 2: Low stock across a region
 *
 * Every product flagged low stock at any store in a region.
 * Returns store name, product name and units on hand.
 * ------------------------------------------------------------------ */

export interface LowStockRow {
  storeName: string;
  productName: string;
  unitsOnHand: number;
}

export async function getLowStockByRegion(
  client: PrismaClient,
  region: string,
): Promise<LowStockRow[]> {
  // Store filter is served by Store @@index([region]); the low-stock predicate
  // is served by InventoryDaily @@index([storeId, isLowStock]).
  const rows = await client.inventoryDaily.findMany({
    where: { isLowStock: true, store: { region } },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { productName: true } },
    },
    orderBy: [{ storeId: "asc" }, { productId: "asc" }],
  });

  return rows.map((r) => ({
    storeName: r.store.name,
    productName: r.product.productName,
    unitsOnHand: r.unitsOnHand,
  }));
}

/* ------------------------------------------------------------------ *
 * Page 3: A product's adjustment history at a store
 *
 * Returns who made each adjustment (with the surrounding detail), newest first.
 * ------------------------------------------------------------------ */

export interface AdjustmentRow {
  adjustedBy: string;
  adjustedAt: Date;
  unitsDelta: number;
  reason: string;
  serialNumber: string;
}

export async function getProductAdjustmentHistory(
  client: PrismaClient,
  storeId: number,
  productId: number,
): Promise<AdjustmentRow[]> {
  // Served by @@index([storeId, productId, adjustedAt]) — equality on
  // storeId + productId, ordered by adjustedAt.
  return client.inventoryAdjustment.findMany({
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

/* ------------------------------------------------------------------ *
 * Page 4: A regional summary
 *
 * Total inventory value per store for a given snapshot date.
 * ------------------------------------------------------------------ */

export interface RegionalStoreValueRow {
  storeId: number;
  storeName: string;
  totalInventoryValue: number;
}

export async function getRegionalInventoryValue(
  client: PrismaClient,
  region: string,
  snapshotDate: Date,
): Promise<RegionalStoreValueRow[]> {
  // Stores in the region — served by Store @@index([region]).
  const stores = await client.store.findMany({
    where: { region },
    select: { id: true, name: true },
  });
  if (stores.length === 0) return [];

  const storeIds = stores.map((s) => s.id);

  // Sum per store for the snapshot date. The snapshotDate equality is served by
  // the unique index @@unique([snapshotDate, storeId, productId]).
  const grouped = await client.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { snapshotDate, storeId: { in: storeIds } },
    _sum: { inventoryValue: true },
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
