import { PrismaClient, Prisma } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * Page 1 — A store's current inventory.
 *
 * Every product held at one store on that store's latest snapshot date.
 * Returns product name, brand name, product family name, and units on hand.
 *
 * Two index-backed steps: find the store's newest snapshotDate, then read that
 * day's rows. Both ride @@index([storeId, snapshotDate]) on InventoryDaily, so
 * neither step scans another store's data.
 */
export async function getStoreCurrentInventory(storeId: number) {
  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  if (!latest) return [];

  const rows = await prisma.inventoryDaily.findMany({
    where: { storeId, snapshotDate: latest.snapshotDate },
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
    orderBy: { product: { name: 'asc' } },
  });

  return rows.map((r) => ({
    productName: r.product.name,
    brandName: r.product.brand.name,
    productFamilyName: r.product.productLine.productFamily.name,
    unitsOnHand: r.unitsOnHand,
  }));
}

/**
 * Page 2 — Low stock across a region.
 *
 * Every product flagged low stock at any store in a region, on the latest
 * snapshot. Returns store name, product name, units on hand.
 *
 * Filters InventoryDaily by (snapshotDate, isLowStock) — backed by
 * @@index([snapshotDate, isLowStock]) — then restricts to the region via the
 * store relation, which uses Store @@index([region]).
 */
export async function getLowStockByRegion(region: string) {
  const latest = await prisma.inventoryDaily.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  if (!latest) return [];

  const rows = await prisma.inventoryDaily.findMany({
    where: {
      snapshotDate: latest.snapshotDate,
      isLowStock: true,
      store: { region },
    },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: [{ store: { name: 'asc' } }, { product: { name: 'asc' } }],
  });

  return rows.map((r) => ({
    storeName: r.store.name,
    productName: r.product.name,
    unitsOnHand: r.unitsOnHand,
  }));
}

/**
 * Page 3 — A product's adjustment history at a store.
 *
 * All adjustments for one product at one store, newest first, including who
 * made each one. Backed by @@index([storeId, productId, adjustedAt]) on
 * InventoryAdjustment: the store+product seek and the time sort come from the
 * one index.
 */
export async function getProductAdjustmentHistory(
  storeId: number,
  productId: number,
) {
  return prisma.inventoryAdjustment.findMany({
    where: { storeId, productId },
    orderBy: { adjustedAt: 'desc' },
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
  });
}

/**
 * Page 4 — A regional summary.
 *
 * Total inventory value per store for a given snapshot date, across a region.
 *
 * groupBy filters on the exact snapshotDate (date-leading @@unique key) plus
 * the store's region (Store @@index([region])) and sums inventoryValue per
 * store in the database. A second lookup resolves store names, so the sum stays
 * a single grouped aggregate rather than per-row hydration.
 */
export async function getRegionalInventoryValue(
  region: string,
  snapshotDate: Date,
) {
  const grouped = await prisma.inventoryDaily.groupBy({
    by: ['storeId'],
    where: { snapshotDate, store: { region } },
    _sum: { inventoryValue: true },
  });

  const stores = await prisma.store.findMany({
    where: { id: { in: grouped.map((g) => g.storeId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(stores.map((s) => [s.id, s.name]));

  return grouped
    .map((g) => ({
      storeId: g.storeId,
      storeName: nameById.get(g.storeId) ?? null,
      totalInventoryValue: g._sum.inventoryValue ?? new Prisma.Decimal(0),
    }))
    .sort((a, b) => (a.storeName ?? '').localeCompare(b.storeName ?? ''));
}
