import { PrismaClient } from '@prisma/client';

const defaultPrisma = new PrismaClient();

/**
 * 1. A store's current inventory:
 * Every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 */
export async function getStoreCurrentInventory(
  storeId: number | string,
  prisma: PrismaClient = defaultPrisma
) {
  const storeWhere =
    typeof storeId === 'number' ? { id: storeId } : { storeKey: storeId };

  const store = await prisma.store.findUnique({
    where: storeWhere,
    select: { id: true },
  });

  if (!store) {
    return [];
  }

  const latestSnapshot = await prisma.inventoryDaily.findFirst({
    where: { storeId: store.id },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });

  if (!latestSnapshot) {
    return [];
  }

  const items = await prisma.inventoryDaily.findMany({
    where: {
      storeId: store.id,
      snapshotDate: latestSnapshot.snapshotDate,
    },
    select: {
      unitsOnHand: true,
      product: {
        select: {
          name: true,
          brand: {
            select: {
              name: true,
            },
          },
          productLine: {
            select: {
              productFamily: {
                select: {
                  name: true,
                },
              },
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
export async function getLowStockByRegion(
  region: string,
  prisma: PrismaClient = defaultPrisma
) {
  const items = await prisma.inventoryDaily.findMany({
    where: {
      isLowStock: true,
      store: {
        region: region,
      },
    },
    select: {
      unitsOnHand: true,
      store: {
        select: {
          name: true,
        },
      },
      product: {
        select: {
          name: true,
        },
      },
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
 * Returning who made each adjustment.
 */
export async function getProductAdjustmentHistory(
  storeId: number | string,
  productId: number | string,
  prisma: PrismaClient = defaultPrisma
) {
  const storeWhere =
    typeof storeId === 'number' ? { id: storeId } : { storeKey: storeId };
  const store = await prisma.store.findUnique({
    where: storeWhere,
    select: { id: true },
  });

  if (!store) {
    return [];
  }

  const productWhere =
    typeof productId === 'number' ? { id: productId } : { sku: productId };
  const product = await prisma.product.findUnique({
    where: productWhere,
    select: { id: true },
  });

  if (!product) {
    return [];
  }

  const adjustments = await prisma.inventoryAdjustment.findMany({
    where: {
      storeId: store.id,
      productId: product.id,
    },
    orderBy: {
      when: 'desc',
    },
    select: {
      whoAdjusted: true,
      when: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
  });

  return adjustments.map((adj) => ({
    whoAdjusted: adj.whoAdjusted,
    adjustedBy: adj.whoAdjusted,
    when: adj.when,
    unitsDelta: adj.unitsDelta,
    reason: adj.reason,
    serialNumber: adj.serialNumber,
  }));
}

/**
 * 4. A regional summary:
 * Total inventory value per store for a given snapshot date.
 */
export async function getRegionalInventorySummary(
  region: string,
  snapshotDate: Date | string,
  prisma: PrismaClient = defaultPrisma
) {
  const date =
    typeof snapshotDate === 'string' ? new Date(snapshotDate) : snapshotDate;

  const stores = await prisma.store.findMany({
    where: {
      region: region,
    },
    select: {
      id: true,
      storeKey: true,
      name: true,
      inventoryDailies: {
        where: {
          snapshotDate: date,
        },
        select: {
          inventoryValue: true,
        },
      },
    },
  });

  return stores.map((store) => {
    const totalInventoryValue = store.inventoryDailies.reduce(
      (sum, item) => sum + item.inventoryValue,
      0
    );

    return {
      storeId: store.id,
      storeKey: store.storeKey,
      storeName: store.name,
      totalInventoryValue,
    };
  });
}
