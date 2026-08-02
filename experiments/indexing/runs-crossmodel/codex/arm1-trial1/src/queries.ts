import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/** Every product held by a store on its most recent inventory snapshot. */
export async function getCurrentInventory(storeKey: string) {
  const latest = await prisma.inventoryDaily.findFirst({
    where: { store: { storeKey } },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  if (!latest) return [];

  return prisma.inventoryDaily.findMany({
    where: { store: { storeKey }, snapshotDate: latest.snapshotDate },
    select: {
      product: {
        select: {
          name: true,
          brand: { select: { name: true } },
          productLine: { select: { productFamily: { select: { name: true } } } },
        },
      },
      unitsOnHand: true,
    },
    orderBy: { product: { name: "asc" } },
  });
}

/** Products marked low-stock at any store in a region. */
export function getLowStockAcrossRegion(region: string) {
  return prisma.inventoryDaily.findMany({
    where: { isLowStock: true, store: { region } },
    select: {
      store: { select: { name: true } },
      product: { select: { name: true } },
      unitsOnHand: true,
    },
    orderBy: [{ store: { name: "asc" } }, { product: { name: "asc" } }],
  });
}

/** Adjustment history for a product at a store, including the actor. */
export function getProductAdjustmentHistory(storeKey: string, skuNumber: string) {
  return prisma.inventoryAdjustment.findMany({
    where: { store: { storeKey }, product: { skuNumber } },
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

/** Total inventory value for each store in a region on a snapshot date. */
export async function getRegionalSummary(region: string, snapshotDate: Date) {
  const rows = await prisma.inventoryDaily.findMany({
    where: { snapshotDate, store: { region } },
    select: { storeId: true, inventoryValue: true, store: { select: { name: true } } },
  });

  const totals = new Map<number, { storeName: string; totalInventoryValue: number }>();
  for (const row of rows) {
    const current = totals.get(row.storeId);
    if (current) current.totalInventoryValue += row.inventoryValue;
    else totals.set(row.storeId, { storeName: row.store.name, totalInventoryValue: row.inventoryValue });
  }

  return [...totals.values()].sort((a, b) => a.storeName.localeCompare(b.storeName));
}
