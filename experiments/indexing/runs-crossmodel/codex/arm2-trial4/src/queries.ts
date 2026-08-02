import { Prisma, PrismaClient } from "@prisma/client";

export type DbClient = PrismaClient | Prisma.TransactionClient;

/** Products and quantities in the most recent snapshot for a store. */
export async function getCurrentInventory(
  db: DbClient,
  storeKey: string,
) {
  return db.$queryRaw<
    Array<{
      productName: string;
      brandName: string;
      productFamilyName: string;
      unitsOnHand: number;
    }>
  >(Prisma.sql`
    WITH latest AS (
      SELECT MAX(snapshotDate) AS snapshotDate
      FROM InventoryDaily
      WHERE storeKey = ${storeKey}
    )
    SELECT p.name AS productName,
           b.name AS brandName,
           pf.name AS productFamilyName,
           i.unitsOnHand AS unitsOnHand
    FROM InventoryDaily i
    JOIN latest l ON l.snapshotDate = i.snapshotDate
    JOIN Product p ON p.sku = i.sku
    JOIN Brand b ON b.id = p.brandId
    JOIN ProductLine pl ON pl.id = p.productLineId
    JOIN ProductFamily pf ON pf.id = pl.productFamilyId
    WHERE i.storeKey = ${storeKey}
    ORDER BY p.name
  `);
}

/** Current low-stock products (the latest snapshot for each store/product). */
export async function getLowStockByRegion(
  db: DbClient,
  region: string,
) {
  return db.$queryRaw<
    Array<{ storeName: string; productName: string; unitsOnHand: number }>
  >(Prisma.sql`
    WITH ranked AS (
      SELECT i.storeKey, i.sku, i.unitsOnHand, i.isLowStock,
             ROW_NUMBER() OVER (
               PARTITION BY i.storeKey, i.sku
               ORDER BY i.snapshotDate DESC
             ) AS rn
      FROM InventoryDaily i
      JOIN Store s ON s.storeKey = i.storeKey
      WHERE s.region = ${region}
    )
    SELECT s.name AS storeName, p.name AS productName, r.unitsOnHand
    FROM ranked r
    JOIN Store s ON s.storeKey = r.storeKey
    JOIN Product p ON p.sku = r.sku
    WHERE r.rn = 1 AND r.isLowStock = 1
    ORDER BY s.name, p.name
  `);
}

/** Adjustment events for one product at one store, newest first. */
export async function getProductAdjustmentHistory(
  db: DbClient,
  storeKey: string,
  sku: string,
) {
  return db.inventoryAdjustment.findMany({
    where: { storeKey, sku },
    orderBy: { adjustedAt: "desc" },
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
  });
}

/** Total inventory value by store in a region for an exact snapshot date. */
export async function getRegionalInventorySummary(
  db: DbClient,
  region: string,
  snapshotDate: Date,
) {
  return db.$queryRaw<
    Array<{ storeKey: string; storeName: string; inventoryValue: Prisma.Decimal }>
  >(Prisma.sql`
    SELECT s.storeKey AS storeKey,
           s.name AS storeName,
           SUM(i.inventoryValue) AS inventoryValue
    FROM Store s
    JOIN InventoryDaily i ON i.storeKey = s.storeKey
    WHERE s.region = ${region} AND i.snapshotDate = ${snapshotDate}
    GROUP BY s.storeKey, s.name
    ORDER BY s.name
  `);
}
