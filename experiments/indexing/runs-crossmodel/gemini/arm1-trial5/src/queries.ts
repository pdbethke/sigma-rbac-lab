import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export interface StoreCurrentInventoryItem {
  productName: string;
  brandName: string;
  productFamilyName: string;
  unitsOnHand: number;
}

export interface LowStockItem {
  storeName: string;
  productName: string;
  unitsOnHand: number;
}

export interface ProductAdjustmentItem {
  adjustedBy: string;
  adjustedAt: Date;
  unitsDelta: number;
  reason: string;
  serialNumber?: string | null;
  storeName?: string;
  productName?: string;
}

export interface RegionalSummaryItem {
  storeId: number;
  storeKey: string;
  storeName: string;
  totalInventoryValue: number;
}

/**
 * 1. A store's current inventory: every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 */
export async function getStoreCurrentInventory(
  storeIdentifier: string | number
): Promise<StoreCurrentInventoryItem[]> {
  const store = await prisma.store.findFirst({
    where:
      typeof storeIdentifier === 'number'
        ? { id: storeIdentifier }
        : { storeKey: String(storeIdentifier) },
  });

  if (!store) {
    return [];
  }

  const latestRecord = await prisma.inventoryDaily.findFirst({
    where: { storeId: store.id },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });

  if (!latestRecord) {
    return [];
  }

  const items = await prisma.inventoryDaily.findMany({
    where: {
      storeId: store.id,
      snapshotDate: latestRecord.snapshotDate,
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
 * 2. Low stock across a region: every product flagged low stock at any store in a region,
 * returning store name, product name and units on hand.
 */
export async function getLowStockAcrossRegion(
  region: string
): Promise<LowStockItem[]> {
  const items = await prisma.inventoryDaily.findMany({
    where: {
      isLowStock: true,
      store: {
        region: region,
      },
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
 * 3. A product's adjustment history at a store, returning who made each adjustment.
 */
export async function getProductAdjustmentHistory(
  storeIdentifier: string | number,
  productIdentifier: string | number
): Promise<ProductAdjustmentItem[]> {
  const store = await prisma.store.findFirst({
    where:
      typeof storeIdentifier === 'number'
        ? { id: storeIdentifier }
        : { storeKey: String(storeIdentifier) },
  });

  const product = await prisma.product.findFirst({
    where:
      typeof productIdentifier === 'number'
        ? { id: productIdentifier }
        : { sku: String(productIdentifier) },
  });

  if (!store || !product) {
    return [];
  }

  const adjustments = await prisma.inventoryAdjustment.findMany({
    where: {
      storeId: store.id,
      productId: product.id,
    },
    include: {
      store: true,
      product: true,
    },
    orderBy: {
      adjustedAt: 'desc',
    },
  });

  return adjustments.map((adj) => ({
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
  snapshotDate: Date | string
): Promise<RegionalSummaryItem[]> {
  const targetDate =
    typeof snapshotDate === 'string' ? new Date(snapshotDate) : snapshotDate;

  const stores = await prisma.store.findMany({
    where: { region },
    include: {
      inventoryDailies: {
        where: { snapshotDate: targetDate },
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
