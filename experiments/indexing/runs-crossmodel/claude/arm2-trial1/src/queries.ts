import { PrismaClient } from "@prisma/client";

// One function per page in the spec. Each takes a PrismaClient so it stays
// testable and connection-agnostic; the caller owns the client lifecycle.
//
// The recurring shape across pages 1, 2 and 4 is "resolve a snapshot date, then
// read InventoryDaily for it". Because InventoryDaily holds years of daily
// snapshots, none of these functions ever reads the whole table — each one pins
// a single snapshot date (and usually a store or a region) so the indexes in
// schema.prisma turn every read into a bounded range scan.

/**
 * Page 1 — A store's current inventory.
 *
 * Every product held at one store on that store's latest snapshot date:
 * product name, brand name, product family name, and units on hand.
 *
 * Access pattern: find the store's latest snapshotDate, then read that one
 * store-day. Both steps ride @@index([storeId, snapshotDate]) on InventoryDaily.
 */
export async function getStoreCurrentInventory(
  prisma: PrismaClient,
  storeId: number
) {
  // Latest snapshot date *for this store* — a single index seek to the tail of
  // the [storeId, snapshotDate] range, not a scan of the store's history.
  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  if (!latest) return [];

  const rows = await prisma.inventoryDaily.findMany({
    where: { storeId, snapshotDate: latest.snapshotDate },
    select: {
      unitsOnHand: true,
      product: {
        select: {
          name: true,
          brand: { select: { name: true } },
          // family name lives one level up from the product's line
          productLine: {
            select: { productFamily: { select: { name: true } } },
          },
        },
      },
    },
  });

  // Flatten to exactly the four fields the page needs.
  return rows.map((r) => ({
    productName: r.product.name,
    brandName: r.product.brand.name,
    productFamilyName: r.product.productLine.productFamily.name,
    unitsOnHand: r.unitsOnHand,
  }));
}

/**
 * Page 2 — Low stock across a region.
 *
 * Every product flagged low stock at any store in a region, on the latest
 * snapshot date: store name, product name, units on hand.
 *
 * Access pattern: resolve the latest snapshotDate once, then read low-stock rows
 * for the region's stores on that date. Store.region is indexed; the region's
 * storeIds drive the [storeId, snapshotDate] index on InventoryDaily, and the
 * low-selectivity isLowStock boolean is filtered from that bounded set.
 */
export async function getLowStockInRegion(prisma: PrismaClient, region: string) {
  // Daily snapshots land for all stores together, so the latest date is global.
  // This MAX rides the tail of the @@unique([snapshotDate, ...]) index.
  const latest = await prisma.inventoryDaily.findFirst({
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  if (!latest) return [];

  const rows = await prisma.inventoryDaily.findMany({
    where: {
      snapshotDate: latest.snapshotDate,
      isLowStock: true,
      store: { region }, // filters to the region's stores via Store.region index
    },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: [{ store: { name: "asc" } }, { product: { name: "asc" } }],
  });

  return rows.map((r) => ({
    storeName: r.store.name,
    productName: r.product.name,
    unitsOnHand: r.unitsOnHand,
  }));
}

/**
 * Page 3 — A product's adjustment history at a store.
 *
 * Every adjustment for one product at one store, newest first, including who
 * made each one.
 *
 * Access pattern: equality on (storeId, productId) then ordered by adjustedAt —
 * exactly @@index([storeId, productId, adjustedAt]) on InventoryAdjustment, so
 * the read is a contiguous range with no separate sort.
 */
export async function getProductAdjustmentHistory(
  prisma: PrismaClient,
  storeId: number,
  productId: number
) {
  return prisma.inventoryAdjustment.findMany({
    where: { storeId, productId },
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

/**
 * Page 4 — A regional summary.
 *
 * Total inventory value per store for a given snapshot date, across the stores
 * in a region.
 *
 * Access pattern: resolve the region's stores (Store.region index), then a
 * single grouped aggregate over InventoryDaily pinned to one snapshotDate and
 * those storeIds — served by the snapshotDate-leading @@unique index. One query
 * for the group-by, one for the store names; no per-store round trips.
 */
export async function getRegionalSummary(
  prisma: PrismaClient,
  region: string,
  snapshotDate: Date
) {
  const stores = await prisma.store.findMany({
    where: { region },
    select: { id: true, name: true },
  });

  if (stores.length === 0) return [];

  const storeIds = stores.map((s) => s.id);
  const nameById = new Map(stores.map((s) => [s.id, s.name]));

  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: { snapshotDate, storeId: { in: storeIds } },
    _sum: { inventoryValue: true },
  });

  return grouped
    .map((g) => ({
      storeId: g.storeId,
      storeName: nameById.get(g.storeId) ?? "",
      totalInventoryValue: g._sum.inventoryValue ?? 0,
    }))
    .sort((a, b) => b.totalInventoryValue - a.totalInventoryValue);
}
