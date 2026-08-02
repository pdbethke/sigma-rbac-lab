import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function getCurrentInventory(storeKey: string) {
  const latest = await prisma.inventoryDaily.findFirst({
    where: { store: { storeKey } },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  if (!latest) return [];
  return prisma.inventoryDaily.findMany({
    where: { snapshotDate: latest.snapshotDate, store: { storeKey } },
    orderBy: { product: { name: "asc" } },
    select: {
      product: { select: { name: true, brand: { select: { name: true } }, productLine: { select: { productFamily: { select: { name: true } } } } } },
      unitsOnHand: true,
    },
  });
}

export function getLowStockByRegion(region: string) {
  return prisma.inventoryDaily.findMany({
    where: { isLowStock: true, store: { region } },
    orderBy: [{ store: { name: "asc" } }, { product: { name: "asc" } }],
    select: { store: { select: { name: true } }, product: { select: { name: true } }, unitsOnHand: true },
  });
}

export function getProductAdjustmentHistory(storeKey: string, skuNumber: string) {
  return prisma.inventoryAdjustment.findMany({
    where: { store: { storeKey }, product: { skuNumber } },
    orderBy: { adjustedAt: "asc" },
    select: { adjustedBy: true, adjustedAt: true, unitsDelta: true, reason: true, serialNumber: true },
  });
}

export async function getRegionalSummary(region: string, snapshotDate: Date) {
  const rows = await prisma.inventoryDaily.groupBy({
    by: ["storeId"], where: { snapshotDate, store: { region } }, _sum: { inventoryValue: true },
  });
  const stores = await prisma.store.findMany({ where: { id: { in: rows.map((r) => r.storeId) } }, select: { id: true, storeKey: true, name: true } });
  const byId = new Map(stores.map((s) => [s.id, s]));
  return rows.map((row) => ({ storeKey: byId.get(row.storeId)!.storeKey, storeName: byId.get(row.storeId)!.name, totalInventoryValue: row._sum.inventoryValue ?? 0 }));
}
