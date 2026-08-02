import { PrismaClient } from '@prisma/client';

const defaultPrisma = new PrismaClient();

/**
 * 1. A store's current inventory: every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 */
export async function getStoreCurrentInventory(
  storeIdOrKey: number | string,
  prisma: PrismaClient = defaultPrisma
) {
  const storeWhere =
    typeof storeIdOrKey === 'number'
      ? { storeId: storeIdOrKey }
      : { store: { storeKey: storeIdOrKey } };

  const latestSnapshot = await prisma.inventoryDaily.findFirst({
    where: storeWhere,
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });

  if (!latestSnapshot) {
    return [];
  }

  const items = await prisma.inventoryDaily.findMany({
    where: {
      ...storeWhere,
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
 * 2. Low stock across a region: every product flagged low stock at any store in a region,
 * returning store name, product name and units on hand.
 */
export async function getLowStockInRegion(
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
 * 3. A product's adjustment history at a store, returning who made each adjustment.
 */
export async function getProductAdjustmentHistory(
  storeIdOrKey: number | string,
  productIdOrSku: number | string,
  prisma: PrismaClient = defaultPrisma
) {
  const storeWhere =
    typeof storeIdOrKey === 'number'
      ? { storeId: storeIdOrKey }
      : { store: { storeKey: storeIdOrKey } };

  const productWhere =
    typeof productIdOrSku === 'number'
      ? { productId: productIdOrSku }
      : { product: { sku: productIdOrSku } };

  const adjustments = await prisma.inventoryAdjustment.findMany({
    where: {
      ...storeWhere,
      ...productWhere,
    },
    orderBy: {
      adjustedAt: 'desc',
    },
    select: {
      id: true,
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
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

  return adjustments.map((adj) => ({
    id: adj.id,
    adjustedBy: adj.adjustedBy,
    adjustedAt: adj.adjustedAt,
    unitsDelta: adj.unitsDelta,
    reason: adj.reason,
    serialNumber: adj.serialNumber,
    storeName: adj.store.name,
    productName: adj.product.name,
  }));
}

/**
 * 4. A regional summary: total inventory value per store for a given snapshot date.
 */
export async function getRegionalSummary(
  region: string,
  snapshotDate: Date | string,
  prisma: PrismaClient = defaultPrisma
) {
  const targetDate =
    typeof snapshotDate === 'string' ? new Date(snapshotDate) : snapshotDate;

  const summary = await prisma.inventoryDaily.groupBy({
    by: ['storeId'],
    where: {
      snapshotDate: targetDate,
      store: {
        region: region,
      },
    },
    _sum: {
      inventoryValue: true,
    },
  });

  const storeIds = summary.map((s) => s.storeId);
  const stores = await prisma.store.findMany({
    where: {
      id: { in: storeIds },
    },
    select: {
      id: true,
      name: true,
    },
  });

  const storeMap = new Map(stores.map((s) => [s.id, s.name]));

  return summary.map((item) => ({
    storeId: item.storeId,
    storeName: storeMap.get(item.storeId) ?? '',
    totalInventoryValue: item._sum.inventoryValue ?? 0,
  }));
}
