import { prisma } from "./client.js";

/**
 * Page 1 — A store's current inventory.
 *
 * Every product held at one store on that store's latest snapshot date.
 * Hits InventoryDaily_storeId_snapshotDate_idx for both the max-date lookup
 * and the row fetch.
 */
export async function getStoreCurrentInventory(storeKey: string) {
  const store = await prisma.store.findUnique({
    where: { storeKey },
    select: { id: true },
  });
  if (!store) return [];

  const latest = await prisma.inventoryDaily.aggregate({
    where: { storeId: store.id },
    _max: { snapshotDate: true },
  });
  const snapshotDate = latest._max.snapshotDate;
  if (!snapshotDate) return [];

  const rows = await prisma.inventoryDaily.findMany({
    where: { storeId: store.id, snapshotDate },
    select: {
      unitsOnHand: true,
      product: {
        select: {
          productName: true,
          brand: { select: { brandName: true } },
          productLine: {
            select: { productFamily: { select: { name: true } } },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    productName: row.product.productName,
    brandName: row.product.brand.brandName,
    productFamilyName: row.product.productLine.productFamily.name,
    unitsOnHand: row.unitsOnHand,
  }));
}

/**
 * Page 2 — Low stock across a region.
 *
 * Every product flagged low stock at any store in the region, on the most
 * recent snapshot date seen in that region.
 */
export async function getLowStockByRegion(region: string) {
  const stores = await prisma.store.findMany({
    where: { region },
    select: { id: true },
  });
  if (stores.length === 0) return [];
  const storeIds = stores.map((s) => s.id);

  const latest = await prisma.inventoryDaily.aggregate({
    where: { storeId: { in: storeIds } },
    _max: { snapshotDate: true },
  });
  const snapshotDate = latest._max.snapshotDate;
  if (!snapshotDate) return [];

  const rows = await prisma.inventoryDaily.findMany({
    where: {
      storeId: { in: storeIds },
      snapshotDate,
      isLowStock: true,
    },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { productName: true } },
    },
    orderBy: [{ store: { name: "asc" } }, { product: { productName: "asc" } }],
  });

  return rows.map((row) => ({
    storeName: row.store.name,
    productName: row.product.productName,
    unitsOnHand: row.unitsOnHand,
  }));
}

/**
 * Page 3 — A product's adjustment history at a store.
 *
 * Newest first. Hits InventoryAdjustment_storeId_productId_adjustedAt_idx,
 * which covers the filter and the sort in one pass.
 */
export async function getProductAdjustmentHistory(
  storeKey: string,
  skuNumber: string,
) {
  const [store, product] = await Promise.all([
    prisma.store.findUnique({ where: { storeKey }, select: { id: true } }),
    prisma.product.findUnique({ where: { skuNumber }, select: { id: true } }),
  ]);
  if (!store || !product) return [];

  const rows = await prisma.inventoryAdjustment.findMany({
    where: { storeId: store.id, productId: product.id },
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
    orderBy: { adjustedAt: "desc" },
  });

  return rows;
}

/**
 * Page 4 — A regional summary.
 *
 * Total inventory value per store in the region for one snapshot date.
 */
export async function getRegionalSummary(region: string, snapshotDate: Date) {
  const stores = await prisma.store.findMany({
    where: { region },
    select: { id: true, name: true, storeKey: true },
  });
  if (stores.length === 0) return [];

  const totals = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { storeId: { in: stores.map((s) => s.id) }, snapshotDate },
    _sum: { inventoryValue: true },
  });

  const byStoreId = new Map(
    totals.map((t) => [t.storeId, t._sum.inventoryValue ?? 0]),
  );

  return stores
    .map((store) => ({
      storeKey: store.storeKey,
      storeName: store.name,
      totalInventoryValue: byStoreId.get(store.id) ?? 0,
    }))
    .sort((a, b) => b.totalInventoryValue - a.totalInventoryValue);
}
