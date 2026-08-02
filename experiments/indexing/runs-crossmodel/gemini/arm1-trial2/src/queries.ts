import { prisma } from './prisma';

/**
 * 1. A store's current inventory:
 * Every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 */
export async function getStoreCurrentInventory(storeKey: string) {
  const latestSnapshot = await prisma.inventoryDaily.findFirst({
    where: {
      store: { storeKey },
    },
    orderBy: {
      snapshotDate: 'desc',
    },
    select: {
      snapshotDate: true,
    },
  });

  if (!latestSnapshot) {
    return [];
  }

  const items = await prisma.inventoryDaily.findMany({
    where: {
      store: { storeKey },
      snapshotDate: latestSnapshot.snapshotDate,
    },
    include: {
      product: {
        include: {
          brand: true,
          productLine: {
            include: {
              productFamily: true,
            },
          },
        },
      },
    },
  });

  return items.map((item) => ({
    productName: item.product.name,
    brandName: item.product.brand.name,
    productFamilyName: item.product.productLine.productFamily.name,
    unitsOnHand: item.unitsOnHand,
  }));
}

/**
 * 2. Low stock across a region:
 * Every product flagged low stock at any store in a region,
 * returning store name, product name and units on hand.
 */
export async function getLowStockAcrossRegion(region: string) {
  const items = await prisma.inventoryDaily.findMany({
    where: {
      isLowStock: true,
      store: { region },
    },
    include: {
      store: true,
      product: true,
    },
  });

  return items.map((item) => ({
    storeName: item.store.name,
    productName: item.product.name,
    unitsOnHand: item.unitsOnHand,
  }));
}

/**
 * 3. A product's adjustment history at a store:
 * Returning who made each adjustment (and adjustment details).
 */
export async function getProductAdjustmentHistory(storeKey: string, sku: string) {
  const adjustments = await prisma.inventoryAdjustment.findMany({
    where: {
      store: { storeKey },
      product: { sku },
    },
    orderBy: {
      adjustedAt: 'desc',
    },
    include: {
      store: true,
      product: true,
    },
  });

  return adjustments.map((adj) => ({
    id: adj.id,
    storeName: adj.store.name,
    productName: adj.product.name,
    whoAdjusted: adj.whoAdjusted,
    adjustedAt: adj.adjustedAt,
    unitsDelta: adj.unitsDelta,
    reason: adj.reason,
    serialNumber: adj.serialNumber,
  }));
}

/**
 * 4. A regional summary:
 * Total inventory value per store for a given snapshot date.
 */
export async function getRegionalSummary(region: string, snapshotDate: Date | string) {
  const targetDate = typeof snapshotDate === 'string' ? new Date(snapshotDate) : snapshotDate;

  const stores = await prisma.store.findMany({
    where: { region },
    select: {
      id: true,
      storeKey: true,
      name: true,
      inventoryDaily: {
        where: { snapshotDate: targetDate },
        select: { inventoryValue: true },
      },
    },
  });

  return stores.map((store) => {
    const totalInventoryValue = store.inventoryDaily.reduce(
      (sum, item) => sum + item.inventoryValue,
      0
    );
    return {
      storeKey: store.storeKey,
      storeName: store.name,
      totalInventoryValue,
    };
  });
}
