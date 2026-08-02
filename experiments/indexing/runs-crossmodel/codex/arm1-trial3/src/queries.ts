import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/** Every product held at a store on that store's latest snapshot date. */
export async function getCurrentInventory(storeKey: string) {
  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeKey },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  if (!latest) return [];

  return prisma.inventoryDaily.findMany({
    where: { storeKey, snapshotDate: latest.snapshotDate },
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
    orderBy: { productSku: "asc" },
  });
}

/** Products marked low stock at any store in a region. */
export function getLowStockInRegion(region: string) {
  return prisma.inventoryDaily.findMany({
    where: { isLowStock: true, store: { region } },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { productName: true } },
    },
    orderBy: [{ store: { name: "asc" } }, { product: { productName: "asc" } }],
  });
}

/** Adjustment history for one product at one store, including the actor. */
export function getProductAdjustmentHistory(storeKey: string, productSku: string) {
  return prisma.inventoryAdjustment.findMany({
    where: { storeKey, productSku },
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

/** Total inventory value per store for a snapshot date. */
export async function getRegionalSummary(snapshotDate: Date) {
  const totals = await prisma.inventoryDaily.groupBy({
    by: ["storeKey"],
    where: { snapshotDate },
    _sum: { inventoryValue: true },
    orderBy: { storeKey: "asc" },
  });

  const stores = await prisma.store.findMany({
    where: { storeKey: { in: totals.map((row) => row.storeKey) } },
    select: { storeKey: true, name: true },
  });
  const names = new Map(stores.map((store) => [store.storeKey, store.name]));

  return totals.map((row) => ({
    storeKey: row.storeKey,
    storeName: names.get(row.storeKey) ?? row.storeKey,
    inventoryValue: row._sum.inventoryValue,
  }));
}
