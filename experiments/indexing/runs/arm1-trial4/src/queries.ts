import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
});

export const prisma = new PrismaClient({ adapter });

/**
 * Page 1 — A store's current inventory.
 * Every product held at one store on that store's latest snapshot date.
 */
export async function getStoreCurrentInventory(storeKey: string) {
  const store = await prisma.store.findUnique({ where: { storeKey } });
  if (!store) return [];

  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeId: store.id },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  if (!latest) return [];

  const rows = await prisma.inventoryDaily.findMany({
    where: { storeId: store.id, snapshotDate: latest.snapshotDate },
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
    orderBy: { product: { productName: 'asc' } },
  });

  return rows.map((r) => ({
    productName: r.product.productName,
    brandName: r.product.brand.brandName,
    productFamilyName: r.product.productLine.productFamily.name,
    unitsOnHand: r.unitsOnHand,
  }));
}

/**
 * Page 2 — Low stock across a region.
 * Every product flagged low stock at any store in the region.
 */
export async function getLowStockByRegion(region: string) {
  const rows = await prisma.inventoryDaily.findMany({
    where: { isLowStock: true, store: { region } },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { productName: true } },
    },
    orderBy: [{ store: { name: 'asc' } }, { product: { productName: 'asc' } }],
  });

  return rows.map((r) => ({
    storeName: r.store.name,
    productName: r.product.productName,
    unitsOnHand: r.unitsOnHand,
  }));
}

/**
 * Page 3 — A product's adjustment history at a store, newest first.
 */
export async function getProductAdjustmentHistory(
  storeKey: string,
  skuNumber: string
) {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      store: { storeKey },
      product: { skuNumber },
    },
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
    orderBy: { adjustedAt: 'desc' },
  });

  return rows;
}

/**
 * Page 4 — Regional summary: total inventory value per store for a snapshot date.
 */
export async function getRegionalInventoryValue(
  region: string,
  snapshotDate: Date
) {
  const grouped = await prisma.inventoryDaily.groupBy({
    by: ['storeId'],
    where: { snapshotDate, store: { region } },
    _sum: { inventoryValue: true },
  });

  const stores = await prisma.store.findMany({
    where: { id: { in: grouped.map((g) => g.storeId) } },
    select: { id: true, storeKey: true, name: true },
  });
  const byId = new Map(stores.map((s) => [s.id, s]));

  return grouped
    .map((g) => ({
      storeKey: byId.get(g.storeId)!.storeKey,
      storeName: byId.get(g.storeId)!.name,
      totalInventoryValue: g._sum.inventoryValue ?? 0,
    }))
    .sort((a, b) => b.totalInventoryValue - a.totalInventoryValue);
}
