import { PrismaClient } from "@prisma/client";

/** Products recorded at a store on its most recent inventory snapshot. */
export async function getCurrentInventory(prisma: PrismaClient, storeKey: string) {
  const store = await prisma.store.findUnique({
    where: { storeKey },
    select: { id: true },
  });
  if (!store) return [];

  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeId: store.id },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  if (!latest) return [];

  return prisma.inventoryDaily.findMany({
    where: { storeId: store.id, snapshotDate: latest.snapshotDate },
    select: {
      product: {
        select: {
          name: true,
          brand: { select: { name: true } },
          productLine: { select: { productFamily: { select: { name: true } } } },
        },
      },
      unitsOnHand: true,
    },
    orderBy: { product: { name: "asc" } },
  });
}

/** Low-stock product snapshots at stores in a region. */
export function getLowStockInRegion(prisma: PrismaClient, region: string) {
  return prisma.inventoryDaily.findMany({
    where: { isLowStock: true, store: { region } },
    select: {
      store: { select: { name: true } },
      product: { select: { name: true } },
      unitsOnHand: true,
      snapshotDate: true,
    },
    orderBy: [{ store: { name: "asc" } }, { product: { name: "asc" } }, { snapshotDate: "desc" }],
  });
}

/** Chronological adjustment history for a product at a store. */
export function getProductAdjustmentHistory(
  prisma: PrismaClient,
  storeKey: string,
  sku: string,
) {
  return prisma.inventoryAdjustment.findMany({
    where: { store: { storeKey }, product: { sku } },
    select: {
      adjustedBy: true,
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
      serialNumber: true,
    },
    orderBy: { adjustedAt: "asc" },
  });
}

/** Total inventory value for each store in a region on a snapshot date. */
export async function getRegionalSummary(
  prisma: PrismaClient,
  region: string,
  snapshotDate: Date,
) {
  const [stores, totals] = await prisma.$transaction([
    prisma.store.findMany({
      where: { region },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryDaily.groupBy({
      by: ["storeId"],
      where: { snapshotDate, store: { region } },
      _sum: { inventoryValue: true },
    }),
  ]);

  const byStore = new Map(totals.map((row) => [row.storeId, row._sum.inventoryValue ?? 0]));
  return stores.map((store) => ({
    storeName: store.name,
    totalInventoryValue: byStore.get(store.id) ?? 0,
  }));
}
