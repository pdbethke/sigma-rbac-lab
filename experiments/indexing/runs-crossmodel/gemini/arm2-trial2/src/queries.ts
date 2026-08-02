import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

function isPrismaClient(obj: any): obj is PrismaClient {
  return obj && (typeof obj.store === 'object' || typeof obj.$connect === 'function');
}

/**
 * 1. A store's current inventory: every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 */
export async function getStoreCurrentInventory(
  storeIdOrClient: string | PrismaClient,
  storeIdOrPrisma?: string | PrismaClient,
  optionalPrisma?: PrismaClient
) {
  let client: PrismaClient = prisma;
  let targetStoreId: string;

  if (isPrismaClient(storeIdOrClient)) {
    client = storeIdOrClient;
    targetStoreId = storeIdOrPrisma as string;
  } else {
    targetStoreId = storeIdOrClient;
    if (isPrismaClient(storeIdOrPrisma)) {
      client = storeIdOrPrisma;
    } else if (optionalPrisma) {
      client = optionalPrisma;
    }
  }

  const store = await client.store.findFirst({
    where: { OR: [{ id: targetStoreId }, { storeKey: targetStoreId }] },
    select: { id: true }
  });

  if (!store) {
    return [];
  }

  const latestSnapshot = await client.inventoryDaily.findFirst({
    where: { storeId: store.id },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true }
  });

  if (!latestSnapshot) {
    return [];
  }

  const items = await client.inventoryDaily.findMany({
    where: {
      storeId: store.id,
      snapshotDate: latestSnapshot.snapshotDate
    },
    select: {
      unitsOnHand: true,
      product: {
        select: {
          name: true,
          brand: {
            select: { name: true }
          },
          productLine: {
            select: {
              productFamily: {
                select: { name: true }
              }
            }
          }
        }
      }
    }
  });

  return items.map((item) => ({
    productName: item.product.name,
    brandName: item.product.brand.name,
    productFamilyName: item.product.productLine.productFamily.name,
    unitsOnHand: item.unitsOnHand
  }));
}

/**
 * 2. Low stock across a region: every product flagged low stock at any store in a region,
 * returning store name, product name and units on hand.
 */
export async function getLowStockAcrossRegion(
  regionOrClient: string | PrismaClient,
  regionOrDate?: string | Date | PrismaClient,
  dateOrPrisma?: Date | string | PrismaClient,
  optionalPrisma?: PrismaClient
) {
  let client: PrismaClient = prisma;
  let region: string;
  let snapshotDate: Date | string | undefined;

  if (isPrismaClient(regionOrClient)) {
    client = regionOrClient;
    region = regionOrDate as string;
    if (dateOrPrisma && !isPrismaClient(dateOrPrisma)) {
      snapshotDate = dateOrPrisma as Date | string;
    }
  } else {
    region = regionOrClient;
    if (isPrismaClient(regionOrDate)) {
      client = regionOrDate;
    } else {
      snapshotDate = regionOrDate as Date | string | undefined;
      if (isPrismaClient(dateOrPrisma)) {
        client = dateOrPrisma;
      } else if (optionalPrisma) {
        client = optionalPrisma;
      }
    }
  }

  const whereClause: any = {
    isLowStock: true,
    store: { region }
  };

  if (snapshotDate) {
    whereClause.snapshotDate = new Date(snapshotDate);
  }

  const items = await client.inventoryDaily.findMany({
    where: whereClause,
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { name: true } }
    }
  });

  return items.map((item) => ({
    storeName: item.store.name,
    productName: item.product.name,
    unitsOnHand: item.unitsOnHand
  }));
}

/**
 * 3. A product's adjustment history at a store, returning who made each adjustment.
 */
export async function getProductAdjustmentHistory(
  arg1: string | PrismaClient,
  arg2: string | PrismaClient,
  arg3?: string | PrismaClient,
  arg4?: PrismaClient
) {
  let client: PrismaClient = prisma;
  let storeIdParam: string;
  let productIdParam: string;

  if (isPrismaClient(arg1)) {
    client = arg1;
    storeIdParam = arg2 as string;
    productIdParam = arg3 as string;
  } else {
    storeIdParam = arg1;
    if (isPrismaClient(arg2)) {
      client = arg2;
      productIdParam = arg3 as string;
    } else {
      productIdParam = arg2;
      if (isPrismaClient(arg3)) {
        client = arg3;
      } else if (arg4) {
        client = arg4;
      }
    }
  }

  const store = await client.store.findFirst({
    where: { OR: [{ id: storeIdParam }, { storeKey: storeIdParam }] },
    select: { id: true }
  });

  const product = await client.product.findFirst({
    where: { OR: [{ id: productIdParam }, { sku: productIdParam }] },
    select: { id: true }
  });

  const targetStoreId = store ? store.id : storeIdParam;
  const targetProductId = product ? product.id : productIdParam;

  const adjustments = await client.inventoryAdjustment.findMany({
    where: {
      storeId: targetStoreId,
      productId: targetProductId
    },
    orderBy: { adjustedAt: 'desc' },
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true
    }
  });

  return adjustments.map((adj) => ({
    adjustedBy: adj.adjustedBy,
    adjustedAt: adj.adjustedAt,
    unitsDelta: adj.unitsDelta,
    reason: adj.reason,
    serialNumber: adj.serialNumber
  }));
}

/**
 * 4. A regional summary: total inventory value per store for a given snapshot date.
 */
export async function getRegionalSummary(
  arg1: string | Date | PrismaClient,
  arg2: string | Date | PrismaClient,
  arg3?: Date | string | PrismaClient,
  arg4?: PrismaClient
) {
  let client: PrismaClient = prisma;
  let region: string;
  let snapshotDate: Date | string;

  if (isPrismaClient(arg1)) {
    client = arg1;
    region = arg2 as string;
    snapshotDate = arg3 as Date | string;
  } else {
    region = arg1 as string;
    if (isPrismaClient(arg2)) {
      client = arg2;
      snapshotDate = arg3 as Date | string;
    } else {
      snapshotDate = arg2 as Date | string;
      if (isPrismaClient(arg3)) {
        client = arg3;
      } else if (arg4) {
        client = arg4;
      }
    }
  }

  const dateObj = new Date(snapshotDate);

  const stores = await client.store.findMany({
    where: { region },
    select: {
      id: true,
      storeKey: true,
      name: true,
      inventoryDailies: {
        where: { snapshotDate: dateObj },
        select: { inventoryValue: true }
      }
    }
  });

  return stores.map((store) => {
    const totalValue = store.inventoryDailies.reduce(
      (sum, item) => sum + item.inventoryValue,
      0
    );
    return {
      storeId: store.id,
      storeKey: store.storeKey,
      storeName: store.name,
      totalInventoryValue: totalValue
    };
  });
}
