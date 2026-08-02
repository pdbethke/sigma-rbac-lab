import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function getCurrentInventory(storeKey: string) {
  const latest = await prisma.inventoryDaily.findFirst({ where: { storeKey }, orderBy: { snapshotDate: "desc" }, select: { snapshotDate: true } });
  if (!latest) return [];
  const rows = await prisma.inventoryDaily.findMany({
    where: { storeKey, snapshotDate: latest.snapshotDate, unitsOnHand: { gt: 0 } },
    select: { product: { select: { name: true, brand: { select: { name: true } }, productLine: { select: { productFamily: { select: { name: true } } } } } }, unitsOnHand: true },
    orderBy: { product: { name: "asc" } },
  });
  return rows.map((r) => ({ productName: r.product.name, brandName: r.product.brand.name, productFamilyName: r.product.productLine.productFamily.name, unitsOnHand: r.unitsOnHand }));
}

export async function getLowStockByRegion(region: string) {
  const rows = await prisma.inventoryDaily.findMany({ where: { isLowStock: true, store: { region } }, select: { store: { select: { name: true } }, product: { select: { name: true } }, unitsOnHand: true }, orderBy: [{ store: { name: "asc" } }, { product: { name: "asc" } }] });
  return rows.map((r) => ({ storeName: r.store.name, productName: r.product.name, unitsOnHand: r.unitsOnHand }));
}

export async function getProductAdjustmentHistory(storeKey: string, skuNumber: string) {
  return prisma.inventoryAdjustment.findMany({ where: { storeKey, skuNumber }, select: { adjustedBy: true, adjustedAt: true, unitsDelta: true, reason: true, serialNumber: true }, orderBy: { adjustedAt: "desc" } });
}

export async function getRegionalInventorySummary(region: string, snapshotDate: Date) {
  const totals = await prisma.inventoryDaily.groupBy({ by: ["storeKey"], where: { snapshotDate, store: { region } }, _sum: { inventoryValue: true }, orderBy: { storeKey: "asc" } });
  if (!totals.length) return [];
  const stores = await prisma.store.findMany({ where: { storeKey: { in: totals.map((r) => r.storeKey) } }, select: { storeKey: true, name: true } });
  const names = new Map(stores.map((s) => [s.storeKey, s.name]));
  return totals.map((r) => ({ storeKey: r.storeKey, storeName: names.get(r.storeKey) ?? r.storeKey, totalInventoryValue: r._sum.inventoryValue ?? 0 }));
}
