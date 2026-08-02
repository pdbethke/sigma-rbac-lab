import { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Products held by a store on its most recent inventory snapshot. */
export async function getCurrentStoreInventory(db: Db, storeKey: string) {
  const latest = await db.inventoryDaily.findFirst({
    where: { storeKey },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  if (!latest) return [];

  const rows = await db.inventoryDaily.findMany({
    where: { storeKey, snapshotDate: latest.snapshotDate },
    select: {
      product: {
        select: {
          name: true,
          brand: { select: { name: true } },
          productLine: {
            select: { productFamily: { select: { name: true } } },
          },
        },
      },
      unitsOnHand: true,
    },
    orderBy: { sku: "asc" },
  });

  return rows.map((row) => ({
    productName: row.product.name,
    brandName: row.product.brand.name,
    productFamilyName: row.product.productLine.productFamily.name,
    unitsOnHand: row.unitsOnHand,
  }));
}

/** Low-stock products at every store in a region, across all snapshots. */
export async function getLowStockByRegion(db: Db, region: string) {
  const rows = await db.inventoryDaily.findMany({
    where: { isLowStock: true, store: { region } },
    select: {
      store: { select: { name: true } },
      product: { select: { name: true } },
      unitsOnHand: true,
    },
    orderBy: [{ store: { name: "asc" } }, { product: { name: "asc" } }, { snapshotDate: "desc" }],
  });

  return rows.map((row) => ({
    storeName: row.store.name,
    productName: row.product.name,
    unitsOnHand: row.unitsOnHand,
  }));
}

/** Adjustment history for one product at one store, including the operator. */
export async function getProductAdjustmentHistory(
  db: Db,
  storeKey: string,
  sku: string,
) {
  return db.inventoryAdjustment.findMany({
    where: { storeKey, sku },
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
    orderBy: { adjustedAt: "desc" },
  });
}

/** Total inventory value per store in a region for one snapshot date. */
export async function getRegionalInventorySummary(
  db: Db,
  region: string,
  snapshotDate: Date,
) {
  const groups = await db.inventoryDaily.groupBy({
    by: ["storeKey"],
    where: { snapshotDate, store: { region } },
    _sum: { inventoryValue: true },
    orderBy: { storeKey: "asc" },
  });

  if (groups.length === 0) return [];
  const stores = await db.store.findMany({
    where: { storeKey: { in: groups.map((group) => group.storeKey) } },
    select: { storeKey: true, name: true },
  });
  const names = new Map(stores.map((store) => [store.storeKey, store.name]));

  return groups.map((group) => ({
    storeKey: group.storeKey,
    storeName: names.get(group.storeKey) ?? group.storeKey,
    inventoryValue: group._sum.inventoryValue ?? 0,
  }));
}
