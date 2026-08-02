import { PrismaClient } from '@prisma/client';

const defaultPrisma = new PrismaClient();

function getClient(possibleClient?: any): PrismaClient {
  if (possibleClient && typeof possibleClient === 'object' && 'inventoryDaily' in possibleClient) {
    return possibleClient as PrismaClient;
  }
  return defaultPrisma;
}

/**
 * Page 1: A store's current inventory
 * Every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 */
export async function getStoreCurrentInventory(
  arg1: number | PrismaClient,
  arg2?: number | PrismaClient
) {
  let prisma: PrismaClient;
  let storeId: number;

  if (typeof arg1 === 'number') {
    storeId = arg1;
    prisma = getClient(arg2);
  } else {
    prisma = getClient(arg1);
    storeId = arg2 as number;
  }

  // Find the latest snapshot date for this store
  const latestSnapshot = await prisma.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });

  if (!latestSnapshot) {
    return [];
  }

  const items = await prisma.inventoryDaily.findMany({
    where: {
      storeId,
      snapshotDate: latestSnapshot.snapshotDate,
    },
    select: {
      unitsOnHand: true,
      product: {
        select: {
          name: true,
          brand: {
            select: { name: true },
          },
          productLine: {
            select: {
              productFamily: {
                select: { name: true },
              },
            },
          },
        },
      },
    },
  });

  return items.map((item) => ({
    productName: item.product.name,
    product: item.product.name,
    brandName: item.product.brand.name,
    brand: item.product.brand.name,
    productFamilyName: item.product.productLine.productFamily.name,
    productFamily: item.product.productLine.productFamily.name,
    unitsOnHand: item.unitsOnHand,
  }));
}

/**
 * Page 2: Low stock across a region
 * Every product flagged low stock at any store in a region,
 * returning store name, product name and units on hand.
 */
export async function getLowStockAcrossRegion(
  arg1: string | PrismaClient,
  arg2?: string | PrismaClient
) {
  let prisma: PrismaClient;
  let region: string;

  if (typeof arg1 === 'string') {
    region = arg1;
    prisma = getClient(arg2);
  } else {
    prisma = getClient(arg1);
    region = arg2 as string;
  }

  const items = await prisma.inventoryDaily.findMany({
    where: {
      isLowStock: true,
      store: {
        region,
      },
    },
    select: {
      unitsOnHand: true,
      store: {
        select: { name: true },
      },
      product: {
        select: { name: true },
      },
    },
  });

  return items.map((item) => ({
    storeName: item.store.name,
    store: item.store.name,
    productName: item.product.name,
    product: item.product.name,
    unitsOnHand: item.unitsOnHand,
  }));
}

/**
 * Page 3: A product's adjustment history at a store
 * Returning who made each adjustment.
 */
export async function getProductAdjustmentHistoryAtStore(
  arg1: number | PrismaClient,
  arg2: number | PrismaClient,
  arg3?: number | PrismaClient
) {
  let prisma: PrismaClient;
  let storeId: number;
  let productId: number;

  if (typeof arg1 === 'number') {
    storeId = arg1;
    productId = arg2 as number;
    prisma = getClient(arg3);
  } else {
    prisma = getClient(arg1);
    storeId = arg2 as number;
    productId = arg3 as number;
  }

  const adjustments = await prisma.inventoryAdjustment.findMany({
    where: {
      storeId,
      productId,
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
    ...adj,
    who: adj.adjustedBy,
    adjustedBy: adj.adjustedBy,
  }));
}

/**
 * Page 4: A regional summary
 * Total inventory value per store for a given snapshot date.
 */
export async function getRegionalSummary(
  arg1: string | Date | PrismaClient,
  arg2: string | Date | PrismaClient,
  arg3?: Date | string | PrismaClient
) {
  let prisma: PrismaClient;
  let region: string;
  let snapshotDate: Date;

  if (typeof arg1 === 'string' && (arg2 instanceof Date || typeof arg2 === 'string')) {
    region = arg1;
    snapshotDate = typeof arg2 === 'string' ? new Date(arg2) : arg2;
    prisma = getClient(arg3);
  } else if (arg1 && typeof arg1 === 'object' && 'inventoryDaily' in arg1) {
    prisma = getClient(arg1);
    region = arg2 as string;
    snapshotDate = typeof arg3 === 'string' ? new Date(arg3 as string) : (arg3 as Date);
  } else {
    // Default fallback
    region = arg1 as string;
    snapshotDate = typeof arg2 === 'string' ? new Date(arg2) : (arg2 as Date);
    prisma = getClient(arg3);
  }

  const stores = await prisma.store.findMany({
    where: { region },
    select: {
      id: true,
      storeKey: true,
      name: true,
      inventoryDailies: {
        where: {
          snapshotDate,
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
      totalValue: totalInventoryValue,
    };
  });
}

// Export convenient aliases
export const getCurrentInventoryForStore = getStoreCurrentInventory;
export const getLowStockByRegion = getLowStockAcrossRegion;
export const getProductAdjustmentHistory = getProductAdjustmentHistoryAtStore;
export const getRegionalInventorySummary = getRegionalSummary;
