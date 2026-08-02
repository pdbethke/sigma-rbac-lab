import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function getCurrentInventoryForStore(storeKey: string) {
  const latest = await prisma.inventoryDaily.aggregate({ where: { storeKey }, _max: { snapshotDate: true } });
  if (!latest._max.snapshotDate) return [];
  const rows = await prisma.inventoryDaily.findMany({
    where: { storeKey, snapshotDate: latest._max.snapshotDate },
    select: { productSku: true, unitsOnHand: true, product: { select: { name: true, brand: { select: { name: true } }, productLine: { select: { productFamily: { select: { name: true } } } } } } },
    orderBy: { productSku: 'asc' },
  });
  return rows.map((row) => ({ sku: row.productSku, productName: row.product.name, brandName: row.product.brand.name, productFamilyName: row.product.productLine.productFamily.name, unitsOnHand: row.unitsOnHand }));
}

export async function getLowStockAcrossRegion(region: string) {
  const rows = await prisma.inventoryDaily.findMany({
    where: { isLowStock: true, store: { region } },
    select: { unitsOnHand: true, store: { select: { name: true } }, product: { select: { name: true } } },
    orderBy: [{ store: { name: 'asc' } }, { product: { name: 'asc' } }],
  });
  return rows.map((row) => ({ storeName: row.store.name, productName: row.product.name, unitsOnHand: row.unitsOnHand }));
}

export async function getProductAdjustmentHistoryAtStore(storeKey: string, productSku: string) {
  return prisma.inventoryAdjustment.findMany({
    where: { storeKey, productSku },
    select: { adjustedBy: true, adjustedAt: true, unitsDelta: true, reason: true, serialNumber: true },
    orderBy: [{ adjustedAt: 'asc' }, { id: 'asc' }],
  });
}

export async function getRegionalInventorySummary(snapshotDate: Date) {
  const rows = await prisma.inventoryDaily.groupBy({ by: ['storeKey'], where: { snapshotDate }, _sum: { inventoryValue: true }, orderBy: { storeKey: 'asc' } });
  const stores = await prisma.store.findMany({ where: { storeKey: { in: rows.map((r) => r.storeKey) } }, select: { storeKey: true, name: true } });
  const names = new Map(stores.map((store) => [store.storeKey, store.name]));
  return rows.map((row) => ({ storeKey: row.storeKey, storeName: names.get(row.storeKey) ?? row.storeKey, totalInventoryValue: row._sum.inventoryValue ?? 0 }));
}
