import { prisma } from './client.js';

/**
 * Page 1 — A store's current inventory.
 *
 * Every product held at one store on that store's latest snapshot date.
 */
export async function getStoreCurrentInventory(storeKey: string) {
  const store = await prisma.store.findUnique({
    where: { storeKey },
    select: { id: true, name: true },
  });
  if (!store) return null;

  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeId: store.id },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  if (!latest) {
    return { store, snapshotDate: null, rows: [] };
  }

  const rows = await prisma.inventoryDaily.findMany({
    where: { storeId: store.id, snapshotDate: latest.snapshotDate },
    select: {
      unitsOnHand: true,
      product: {
        select: {
          productName: true,
          brand: { select: { brandName: true } },
          productLine: {
            select: {
              productFamily: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { product: { productName: 'asc' } },
  });

  return {
    store,
    snapshotDate: latest.snapshotDate,
    rows: rows.map((row) => ({
      productName: row.product.productName,
      brandName: row.product.brand.brandName,
      productFamilyName: row.product.productLine.productFamily.name,
      unitsOnHand: row.unitsOnHand,
    })),
  };
}

/**
 * Page 2 — Low stock across a region.
 *
 * Every product flagged low stock at any store in the region, on the latest
 * snapshot date present in the region.
 */
export async function getRegionLowStock(region: string) {
  const latest = await prisma.inventoryDaily.findFirst({
    where: { store: { region } },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  if (!latest) return { region, snapshotDate: null, rows: [] };

  const rows = await prisma.inventoryDaily.findMany({
    where: {
      isLowStock: true,
      snapshotDate: latest.snapshotDate,
      store: { region },
    },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { productName: true } },
    },
    orderBy: [{ store: { name: 'asc' } }, { product: { productName: 'asc' } }],
  });

  return {
    region,
    snapshotDate: latest.snapshotDate,
    rows: rows.map((row) => ({
      storeName: row.store.name,
      productName: row.product.productName,
      unitsOnHand: row.unitsOnHand,
    })),
  };
}

/**
 * Page 3 — A product's adjustment history at a store, newest first,
 * including who made each adjustment.
 */
export async function getProductAdjustmentHistory(
  storeKey: string,
  skuNumber: string,
) {
  const adjustments = await prisma.inventoryAdjustment.findMany({
    where: {
      store: { storeKey },
      product: { skuNumber },
    },
    select: {
      adjustedAt: true,
      adjustedBy: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
    orderBy: { adjustedAt: 'desc' },
  });

  return { storeKey, skuNumber, adjustments };
}

/**
 * Page 4 — Regional summary: total inventory value per store for a given
 * snapshot date.
 */
export async function getRegionalInventoryValue(
  region: string,
  snapshotDate: Date,
) {
  const stores = await prisma.store.findMany({
    where: { region },
    select: { id: true, storeKey: true, name: true },
    orderBy: { name: 'asc' },
  });

  const totals = await prisma.inventoryDaily.groupBy({
    by: ['storeId'],
    where: { snapshotDate, store: { region } },
    _sum: { inventoryValue: true },
  });

  const byStoreId = new Map(
    totals.map((total) => [total.storeId, total._sum.inventoryValue ?? 0]),
  );

  return {
    region,
    snapshotDate,
    rows: stores.map((store) => ({
      storeKey: store.storeKey,
      storeName: store.name,
      totalInventoryValue: byStoreId.get(store.id) ?? 0,
    })),
  };
}
