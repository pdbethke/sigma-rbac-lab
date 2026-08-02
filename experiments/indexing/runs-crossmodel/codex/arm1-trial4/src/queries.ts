import { PrismaClient } from "@prisma/client";

/** Shared client; callers may pass a transaction/client for testing. */
export const prisma = new PrismaClient();

/** Every product recorded for a store on that store's latest snapshot date. */
export async function getStoreCurrentInventory(
  storeKey: string,
  db: PrismaClient = prisma,
) {
  const latest = await db.inventoryDaily.aggregate({
    where: { storeKey },
    _max: { snapshotDate: true },
  });
  const snapshotDate = latest._max.snapshotDate;
  if (!snapshotDate) return [];

  return db.inventoryDaily.findMany({
    where: { storeKey, snapshotDate },
    select: {
      unitsOnHand: true,
      product: {
        select: {
          name: true,
          brand: { select: { name: true } },
          productLine: {
            select: { productFamily: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { product: { name: "asc" } },
  });
}

/** Low-stock products at all stores in a region. */
export function getRegionalLowStock(region: string, db: PrismaClient = prisma) {
  return db.inventoryDaily.findMany({
    where: { isLowStock: true, store: { region } },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: [{ store: { name: "asc" } }, { product: { name: "asc" } }],
  });
}

/** Adjustment history for one product at one store, including the actor. */
export function getProductAdjustmentHistory(
  storeKey: string,
  productIdOrSku: number | string,
  db: PrismaClient = prisma,
) {
  return db.inventoryAdjustment.findMany({
    where: {
      storeKey,
      ...(typeof productIdOrSku === "number"
        ? { productId: productIdOrSku }
        : { product: { sku: productIdOrSku } }),
    },
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
    orderBy: { adjustedAt: "desc" },
  });
}

/** Total inventory value per store in a region on a snapshot date. */
export async function getRegionalInventorySummary(
  region: string,
  snapshotDate: Date,
  db: PrismaClient = prisma,
) {
  const stores = await db.store.findMany({
    where: { region },
    select: { storeKey: true, name: true },
    orderBy: { name: "asc" },
  });
  if (stores.length === 0) return [];

  const totals = await db.inventoryDaily.groupBy({
    by: ["storeKey"],
    where: { snapshotDate, storeKey: { in: stores.map((s) => s.storeKey) } },
    _sum: { inventoryValue: true },
  });
  const byStore = new Map(totals.map((row) => [row.storeKey, row._sum.inventoryValue ?? 0]));
  return stores.map((store) => ({
    storeName: store.name,
    inventoryValue: byStore.get(store.storeKey) ?? 0,
  }));
}
