import { PrismaClient } from "@prisma/client";

/** Shared client for application code. Call `prisma.$disconnect()` on shutdown. */
export const prisma = new PrismaClient();

/**
 * Products held by a store on its most recent snapshot date.
 */
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

/** Every low-stock product at every store in a region, across all snapshots. */
export function getLowStockByRegion(region: string) {
  return prisma.inventoryDaily.findMany({
    where: {
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
}

/** Adjustment history for one product at one store, oldest adjustment first. */
export function getProductAdjustmentHistory(storeKey: string, sku: string) {
  return prisma.inventoryAdjustment.findMany({
    where: { storeKey, sku },
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
    orderBy: { adjustedAt: "asc" },
  });
}

/** Total inventory value by store for a region and an exact snapshot date. */
export async function getRegionalSummary(region: string, snapshotDate: Date) {
  const rows = await prisma.inventoryDaily.findMany({
    where: {
      snapshotDate,
      store: { region },
    },
    select: {
      inventoryValue: true,
      store: { select: { storeKey: true, name: true } },
    },
  });

  const totals = new Map<string, { storeKey: string; storeName: string; totalInventoryValue: number }>();
  for (const row of rows) {
    const existing = totals.get(row.store.storeKey);
    if (existing) {
      existing.totalInventoryValue += row.inventoryValue;
    } else {
      totals.set(row.store.storeKey, {
        storeKey: row.store.storeKey,
        storeName: row.store.name,
        totalInventoryValue: row.inventoryValue,
      });
    }
  }

  return [...totals.values()].sort((a, b) => a.storeName.localeCompare(b.storeName));
}
