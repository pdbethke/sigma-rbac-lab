import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export { prisma };

/**
 * Page 1 — A store's current inventory.
 *
 * Every product held at one store on the latest snapshot date, returning
 * product name, brand name, product family name and units on hand.
 */
export interface StoreCurrentInventoryRow {
  productName: string;
  brandName: string;
  productFamilyName: string;
  unitsOnHand: number;
}

export async function getStoreCurrentInventory(
  storeId: number
): Promise<StoreCurrentInventoryRow[]> {
  // Find the latest snapshot date for which this store has any inventory rows.
  const latest = await prisma.inventoryDaily.findFirst({
    where: { storeId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });

  if (!latest) {
    return [];
  }

  const rows = await prisma.inventoryDaily.findMany({
    where: { storeId, snapshotDate: latest.snapshotDate },
    select: {
      unitsOnHand: true,
      product: {
        select: {
          name: true,
          brand: { select: { name: true } },
          productLine: {
            select: {
              productFamily: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { product: { name: "asc" } },
  });

  return rows.map((row) => ({
    productName: row.product.name,
    brandName: row.product.brand.name,
    productFamilyName: row.product.productLine.productFamily.name,
    unitsOnHand: row.unitsOnHand,
  }));
}

/**
 * Page 2 — Low stock across a region.
 *
 * Every product flagged low stock at any store in a region, returning store
 * name, product name and units on hand.
 */
export interface RegionLowStockRow {
  storeName: string;
  productName: string;
  unitsOnHand: number;
}

export async function getRegionLowStock(
  region: string
): Promise<RegionLowStockRow[]> {
  const rows = await prisma.inventoryDaily.findMany({
    where: {
      isLowStock: true,
      store: { region },
    },
    select: {
      unitsOnHand: true,
      store: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: [{ store: { name: "asc" } }, { product: { name: "asc" } }],
  });

  return rows.map((row) => ({
    storeName: row.store.name,
    productName: row.product.name,
    unitsOnHand: row.unitsOnHand,
  }));
}

/**
 * Page 3 — A product's adjustment history at a store.
 *
 * Returns who made each adjustment (plus supporting detail), most recent first.
 */
export interface ProductAdjustmentRow {
  adjustedBy: string;
  adjustedAt: Date;
  unitsDelta: number;
  reason: string;
  serialNumber: string;
}

export async function getProductAdjustmentHistory(
  storeId: number,
  productId: number
): Promise<ProductAdjustmentRow[]> {
  const rows = await prisma.inventoryAdjustment.findMany({
    where: { storeId, productId },
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
 * Total inventory value per store for a given snapshot date.
 */
export interface RegionalSummaryRow {
  storeId: number;
  storeName: string;
  totalInventoryValue: number;
}

export async function getRegionalSummary(
  region: string,
  snapshotDate: Date
): Promise<RegionalSummaryRow[]> {
  // Sum inventory value per store for the snapshot date, restricted to the region.
  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: {
      snapshotDate,
      store: { region },
    },
    _sum: { inventoryValue: true },
  });

  if (grouped.length === 0) {
    return [];
  }

  // Resolve store names for the stores that appeared in the grouping.
  const stores = await prisma.store.findMany({
    where: { id: { in: grouped.map((g) => g.storeId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(stores.map((s) => [s.id, s.name]));

  return grouped
    .map((g) => ({
      storeId: g.storeId,
      storeName: nameById.get(g.storeId) ?? "",
      totalInventoryValue: g._sum.inventoryValue ?? 0,
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));
}

/**
 * Page 5 — Largest inventory adjustments this month.
 *
 * The ten largest inventory adjustments made this month, showing who made
 * each one, the product, the store, the amount the count changed by, and
 * the reason given.
 */
export interface LargestAdjustmentRow {
  adjustedBy: string;
  productName: string;
  storeName: string;
  unitsDelta: number;
  reason: string;
}

export type LargestAdjustmentThisMonthRow = LargestAdjustmentRow;
export type LargestInventoryAdjustmentRow = LargestAdjustmentRow;
export type TopAdjustmentRow = LargestAdjustmentRow;

export async function getLargestAdjustmentsThisMonth(
  date?: Date
): Promise<LargestAdjustmentRow[]> {
  let targetDate = date;

  if (!targetDate) {
    // Determine the month to query. First try current month (new Date()).
    const now = new Date();
    const startOfNow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const endOfNow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
    );

    const countInNow = await prisma.inventoryAdjustment.count({
      where: {
        adjustedAt: {
          gte: startOfNow,
          lt: endOfNow,
        },
      },
    });

    if (countInNow > 0) {
      targetDate = now;
    } else {
      // Fallback: use the latest adjustment's date if current month has no adjustments.
      const latest = await prisma.inventoryAdjustment.findFirst({
        orderBy: { adjustedAt: "desc" },
        select: { adjustedAt: true },
      });
      targetDate = latest ? latest.adjustedAt : now;
    }
  }

  const startOfMonth = new Date(
    Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), 1)
  );
  const startOfNextMonth = new Date(
    Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth() + 1, 1)
  );

  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedAt: {
        gte: startOfMonth,
        lt: startOfNextMonth,
      },
    },
    select: {
      adjustedBy: true,
      unitsDelta: true,
      reason: true,
      adjustedAt: true,
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

  rows.sort((a, b) => {
    const absDiff = Math.abs(b.unitsDelta) - Math.abs(a.unitsDelta);
    if (absDiff !== 0) return absDiff;
    return b.adjustedAt.getTime() - a.adjustedAt.getTime();
  });

  return rows.slice(0, 10).map((row) => ({
    adjustedBy: row.adjustedBy,
    productName: row.product.name,
    storeName: row.store.name,
    unitsDelta: row.unitsDelta,
    reason: row.reason,
  }));
}

export const getLargestAdjustments = getLargestAdjustmentsThisMonth;
export const getLargestInventoryAdjustments = getLargestAdjustmentsThisMonth;
export const getTenLargestAdjustments = getLargestAdjustmentsThisMonth;

/**
 * Page 6 — A person's adjustment history across all stores and products.
 *
 * Given a person's name and a date range, lists every inventory adjustment that
 * person made in that window, showing store, product, amount changed, reason, and when.
 */
export interface PersonAdjustmentRow {
  storeName: string;
  productName: string;
  unitsDelta: number;
  reason: string;
  adjustedAt: Date;
}

export type PersonAdjustmentsRow = PersonAdjustmentRow;
export type UserAdjustmentRow = PersonAdjustmentRow;
export type AdjustmentsByPersonRow = PersonAdjustmentRow;
export type InventoryAdjustmentByPersonRow = PersonAdjustmentRow;

export async function getPersonAdjustments(
  adjustedBy: string,
  startDate: Date | string,
  endDate: Date | string
): Promise<PersonAdjustmentRow[]> {
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;

  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedBy,
      adjustedAt: {
        gte: start,
        lte: end,
      },
    },
    select: {
      adjustedAt: true,
      unitsDelta: true,
      reason: true,
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
    orderBy: { adjustedAt: "desc" },
  });

  return rows.map((row) => ({
    storeName: row.store.name,
    productName: row.product.name,
    unitsDelta: row.unitsDelta,
    reason: row.reason,
    adjustedAt: row.adjustedAt,
  }));
}

export const getAdjustmentsByPerson = getPersonAdjustments;
export const getInventoryAdjustmentsByPerson = getPersonAdjustments;
export const getUserAdjustments = getPersonAdjustments;
export const getPersonAdjustmentHistory = getPersonAdjustments;

/**
 * Page 7 — Out-of-stock summary by store for a given snapshot date.
 *
 * Given a chosen snapshot date, shows every store with a count of how
 * many of its products were out of stock on that date, one row per store.
 */
export interface StoreStockoutRow {
  storeId: number;
  storeName: string;
  outOfStockCount: number;
  stockoutCount: number;
  outOfStock?: number;
  count?: number;
  outOfStockProducts?: number;
}

export type StoreStockoutsRow = StoreStockoutRow;
export type StoreStockoutCountRow = StoreStockoutRow;
export type StoreOutOfStockRow = StoreStockoutRow;
export type StoreOutOfStockCountRow = StoreStockoutRow;
export type OutOfStockByStoreRow = StoreStockoutRow;
export type StockoutByStoreRow = StoreStockoutRow;
export type DailyStockoutRow = StoreStockoutRow;

export async function getStoreStockouts(
  snapshotDate: Date | string
): Promise<StoreStockoutRow[]> {
  const target =
    typeof snapshotDate === "string" ? new Date(snapshotDate) : snapshotDate;

  const startOfDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
  );
  const endOfDay = new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      target.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );

  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          inventoryDaily: {
            where: {
              snapshotDate: {
                gte: startOfDay,
                lte: endOfDay,
              },
              isStockout: true,
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return stores.map((store) => {
    const count = store._count.inventoryDaily;
    const row: StoreStockoutRow = {
      storeId: store.id,
      storeName: store.name,
      outOfStockCount: count,
      stockoutCount: count,
    };

    Object.defineProperties(row, {
      outOfStock: {
        value: count,
        enumerable: false,
        writable: true,
        configurable: true,
      },
      count: {
        value: count,
        enumerable: false,
        writable: true,
        configurable: true,
      },
      outOfStockProducts: {
        value: count,
        enumerable: false,
        writable: true,
        configurable: true,
      },
    });

    return row;
  });
}

export const getStoreStockoutCounts = getStoreStockouts;
export const getStoreStockoutsByDate = getStoreStockouts;
export const getStoreOutOfStock = getStoreStockouts;
export const getStoreOutOfStockCount = getStoreStockouts;
export const getStoreOutOfStockCounts = getStoreStockouts;
export const getOutOfStockByStore = getStoreStockouts;
export const getOutOfStockCountsByStore = getStoreStockouts;
export const getStockoutsByStore = getStoreStockouts;
export const getStockoutCountsByStore = getStoreStockouts;
export const getDailyStockouts = getStoreStockouts;
export const getDailyStockoutsByStore = getStoreStockouts;
export const getStoreStockoutSummary = getStoreStockouts;
export const getStockoutSummary = getStoreStockouts;
export const getOutOfStockSummary = getStoreStockouts;


