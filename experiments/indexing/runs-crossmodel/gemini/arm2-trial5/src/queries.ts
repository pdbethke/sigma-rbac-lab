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

export interface AdjustmentHistoryItem {
  id: number;
  storeId: number;
  productId: number;
  adjustedBy: string;
  adjustedAt: Date;
  unitsDelta: number;
  reason: string;
  serialNumber: string | null;
}

export interface RegionalSummaryItem {
  storeId: number;
  storeName: string;
  totalInventoryValue: number;
}

function isPrismaClient(obj: unknown): obj is PrismaClient {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    ('$connect' in obj || 'inventoryDaily' in obj)
  );
}

/**
 * 1. A store's current inventory: every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 */
export async function getStoreCurrentInventory(
  storeId: number,
  client?: PrismaClient
): Promise<StoreCurrentInventoryItem[]> {
  const prismaClient = client || prisma;

  const latest = await prismaClient.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });

  if (!latest) {
    return [];
  }

  const records = await prismaClient.inventoryDaily.findMany({
    where: {
      storeId,
      snapshotDate: latest.snapshotDate,
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

  return records.map((r) => ({
    productName: r.product.name,
    brandName: r.product.brand.name,
    productFamilyName: r.product.productLine.productFamily.name,
    unitsOnHand: r.unitsOnHand,
  }));
}

/**
 * 2. Low stock across a region: every product flagged low stock at any store in a region,
 * returning store name, product name and units on hand.
 */
export async function getLowStockAcrossRegion(
  region: string,
  snapshotDateOrClient?: Date | string | PrismaClient,
  clientParam?: PrismaClient
): Promise<LowStockItem[]> {
  let prismaClient = prisma;
  let targetDate: Date | undefined = undefined;

  if (isPrismaClient(snapshotDateOrClient)) {
    prismaClient = snapshotDateOrClient;
  } else if (snapshotDateOrClient) {
    targetDate = new Date(snapshotDateOrClient);
    if (clientParam) {
      prismaClient = clientParam;
    }
  } else if (clientParam) {
    prismaClient = clientParam;
  }

  if (!targetDate) {
    const latest = await prismaClient.inventoryDaily.findFirst({
      where: {
        store: { region },
      },
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });

    if (!latest) {
      return [];
    }
    targetDate = latest.snapshotDate;
  }

  const records = await prismaClient.inventoryDaily.findMany({
    where: {
      isLowStock: true,
      snapshotDate: targetDate,
      store: { region },
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

  return records.map((r) => ({
    storeName: r.store.name,
    productName: r.product.name,
    unitsOnHand: r.unitsOnHand,
  }));
}

/**
 * 3. A product's adjustment history at a store, returning who made each adjustment.
 */
export async function getProductAdjustmentHistory(
  storeId: number,
  productId: number,
  client?: PrismaClient
): Promise<AdjustmentHistoryItem[]> {
  const prismaClient = client || prisma;

  const records = await prismaClient.inventoryAdjustment.findMany({
    where: {
      storeId,
      productId,
    },
    orderBy: {
      adjustedAt: 'desc',
    },
    select: {
      id: true,
      storeId: true,
      productId: true,
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
  });

  return records.map((a) => ({
    id: a.id,
    storeId: a.storeId,
    productId: a.productId,
    adjustedBy: a.adjustedBy,
    adjustedAt: a.adjustedAt,
    unitsDelta: a.unitsDelta,
    reason: a.reason,
    serialNumber: a.serialNumber,
  }));
}

/**
 * 4. A regional summary: total inventory value per store for a given snapshot date.
 */
export async function getRegionalSummary(
  region: string,
  snapshotDate: Date | string,
  client?: PrismaClient
): Promise<RegionalSummaryItem[]> {
  const prismaClient = client || prisma;
  const targetDate = new Date(snapshotDate);

  const summary = await prismaClient.inventoryDaily.groupBy({
    by: ['storeId'],
    where: {
      snapshotDate: targetDate,
      store: {
        region,
      },
    },
    _sum: {
      inventoryValue: true,
    },
  });

  if (summary.length === 0) {
    return [];
  }

  const storeIds = summary.map((s) => s.storeId);
  const stores = await prismaClient.store.findMany({
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
