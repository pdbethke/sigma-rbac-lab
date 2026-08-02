import { PrismaClient } from '@prisma/client';

/**
 * 1. A store's current inventory:
 * Every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 */
export async function getStoreCurrentInventory(
  prisma: PrismaClient,
  storeId: string
) {
  const latestSnapshot = await prisma.inventoryDaily.findFirst({
    where: {
      OR: [{ storeId: storeId }, { store: { storeKey: storeId } }],
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
      OR: [{ storeId: storeId }, { store: { storeKey: storeId } }],
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
export async function getLowStockAcrossRegion(
  prisma: PrismaClient,
  region: string
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
  prisma: PrismaClient,
  storeId: string,
  productId: string
) {
  const adjustments = await prisma.inventoryAdjustment.findMany({
    where: {
      OR: [{ storeId: storeId }, { store: { storeKey: storeId } }],
      AND: {
        OR: [{ productId: productId }, { product: { sku: productId } }],
      },
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
 * 4. A regional summary:
 * Total inventory value per store for a given snapshot date.
 */
export async function getRegionalSummary(
  prisma: PrismaClient,
  region: string,
  snapshotDate: Date | string
) {
  const dateObj =
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
          snapshotDate: dateObj,
        },
        select: {
          inventoryValue: true,
        },
      },
    },
  });

  return stores.map((store) => ({
    storeId: store.id,
    storeKey: store.storeKey,
    storeName: store.name,
    totalInventoryValue: store.inventoryDailies.reduce(
      (sum, item) => sum + item.inventoryValue,
      0
    ),
  }));
}
