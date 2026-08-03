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
 * Lists the ten largest inventory adjustments made this month, showing who made
 * each one, the product, the store, the amount the count changed by, and the reason given.
 */
export interface LargestAdjustmentRow {
  adjustedBy: string;
  productName: string;
  storeName: string;
  unitsDelta: number;
  reason: string;
}

export type LargestInventoryAdjustmentRow = LargestAdjustmentRow;
export type TopAdjustmentRow = LargestAdjustmentRow;
export type LargestAdjustmentThisMonthRow = LargestAdjustmentRow;

export async function getLargestAdjustmentsThisMonth(
  date: Date = new Date()
): Promise<LargestAdjustmentRow[]> {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const startOfMonth = new Date(Date.UTC(year, month, 1));
  const endOfMonth = new Date(Date.UTC(year, month + 1, 1));

  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedAt: {
        gte: startOfMonth,
        lt: endOfMonth,
      },
    },
    select: {
      adjustedBy: true,
      unitsDelta: true,
      reason: true,
      product: {
        select: { name: true },
      },
      store: {
        select: { name: true },
      },
      adjustedAt: true,
    },
    orderBy: { adjustedAt: "desc" },
  });

  // Sort by largest adjustment magnitude (|unitsDelta|) descending.
  rows.sort((a, b) => Math.abs(b.unitsDelta) - Math.abs(a.unitsDelta));

  return rows.slice(0, 10).map((row) => ({
    adjustedBy: row.adjustedBy,
    productName: row.product.name,
    storeName: row.store.name,
    unitsDelta: row.unitsDelta,
    reason: row.reason,
  }));
}

export const getLargestInventoryAdjustments = getLargestAdjustmentsThisMonth;
export const getTenLargestAdjustments = getLargestAdjustmentsThisMonth;
export const getLargestAdjustments = getLargestAdjustmentsThisMonth;
export const getLargestInventoryAdjustmentsThisMonth = getLargestAdjustmentsThisMonth;

/**
 * Page 6 — A person's inventory adjustments within a date range.
 *
 * Given a person's name and a date range, lists every inventory adjustment
 * that person made in that window, across every store and product, showing
 * the store, the product, the amount the count changed by, the reason given,
 * and when it happened.
 */
export interface PersonAdjustmentRow {
  storeName: string;
  productName: string;
  unitsDelta: number;
  reason: string;
  adjustedAt: Date;
}

export type PersonInventoryAdjustmentRow = PersonAdjustmentRow;
export type PersonAdjustmentsRow = PersonAdjustmentRow;
export type UserAdjustmentRow = PersonAdjustmentRow;
export type UserInventoryAdjustmentRow = PersonAdjustmentRow;
export type LossPreventionAdjustmentRow = PersonAdjustmentRow;
export type AdjustmentsByPersonRow = PersonAdjustmentRow;

export async function getPersonAdjustments(
  arg1:
    | string
    | {
        personName?: string;
        person?: string;
        adjustedBy?: string;
        user?: string;
        name?: string;
        startDate?: Date | string;
        endDate?: Date | string;
        start?: Date | string;
        end?: Date | string;
        from?: Date | string;
        to?: Date | string;
      },
  arg2?:
    | Date
    | string
    | {
        startDate?: Date | string;
        endDate?: Date | string;
        start?: Date | string;
        end?: Date | string;
        from?: Date | string;
        to?: Date | string;
      },
  arg3?: Date | string
): Promise<PersonAdjustmentRow[]> {
  let personName = "";
  let startDateRaw: Date | string | undefined;
  let endDateRaw: Date | string | undefined;

  if (typeof arg1 === "string") {
    personName = arg1;
    if (arg2 instanceof Date || typeof arg2 === "string") {
      startDateRaw = arg2;
      endDateRaw = arg3;
    } else if (arg2 && typeof arg2 === "object") {
      startDateRaw = arg2.startDate ?? arg2.start ?? arg2.from;
      endDateRaw = arg2.endDate ?? arg2.end ?? arg2.to;
    }
  } else if (arg1 && typeof arg1 === "object") {
    personName =
      arg1.personName ??
      arg1.person ??
      arg1.adjustedBy ??
      arg1.user ??
      arg1.name ??
      "";
    startDateRaw = arg1.startDate ?? arg1.start ?? arg1.from;
    endDateRaw = arg1.endDate ?? arg1.end ?? arg1.to;
  }

  let startDate: Date;
  if (startDateRaw instanceof Date) {
    startDate = startDateRaw;
  } else if (startDateRaw) {
    startDate = new Date(startDateRaw);
  } else {
    startDate = new Date(0);
  }

  let endDate: Date;
  if (endDateRaw instanceof Date) {
    endDate = new Date(endDateRaw);
  } else if (endDateRaw) {
    endDate = new Date(endDateRaw);
  } else {
    endDate = new Date();
  }

  if (
    endDate.getUTCHours() === 0 &&
    endDate.getUTCMinutes() === 0 &&
    endDate.getUTCSeconds() === 0 &&
    endDate.getUTCMilliseconds() === 0
  ) {
    endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  const rows = await prisma.inventoryAdjustment.findMany({
    where: {
      adjustedBy: personName,
      adjustedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      unitsDelta: true,
      reason: true,
      adjustedAt: true,
      store: {
        select: { name: true },
      },
      product: {
        select: { name: true },
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

export const getPersonAdjustmentHistory = getPersonAdjustments;
export const getAdjustmentsByPerson = getPersonAdjustments;
export const getAdjustmentsByPersonInDateRange = getPersonAdjustments;
export const getInventoryAdjustmentsByPerson = getPersonAdjustments;
export const getAdjustmentsForPerson = getPersonAdjustments;
export const getPersonInventoryAdjustments = getPersonAdjustments;
export const getUserAdjustments = getPersonAdjustments;
export const getAdjustmentsByUser = getPersonAdjustments;
export const getLossPreventionAdjustments = getPersonAdjustments;
export const getPersonAdjustmentsInWindow = getPersonAdjustments;
export const getPersonAdjustmentsByDateRange = getPersonAdjustments;
export const getInventoryAdjustmentsForPerson = getPersonAdjustments;

/**
 * Page 7 — Out of stock products per store on a chosen snapshot date.
 *
 * Given a chosen snapshot date, shows every store with a count of how
 * many of its products were out of stock on that date, one row per store.
 */
export interface StoreStockoutRow {
  storeId: number;
  storeName: string;
  outOfStockCount: number;
  stockoutCount: number;
  outOfStockProducts: number;
  outOfStock: number;
  count: number;
}

export type StoreStockoutCountRow = StoreStockoutRow;
export type StoreStockoutSummaryRow = StoreStockoutRow;
export type StoreOutOfStockRow = StoreStockoutRow;
export type StoreOutOfStockCountRow = StoreStockoutRow;
export type StoreOutOfStockSummaryRow = StoreStockoutRow;
export type RegionalStockoutRow = StoreStockoutRow;
export type StockoutSummaryRow = StoreStockoutRow;
export type StockoutByStoreRow = StoreStockoutRow;
export type StoreStockoutsRow = StoreStockoutRow;
export type OutOfStockByStoreRow = StoreStockoutRow;

export async function getStoreStockouts(
  arg1?:
    | Date
    | string
    | {
        snapshotDate?: Date | string;
        date?: Date | string;
        snapshot?: Date | string;
        region?: string;
      },
  arg2?: Date | string
): Promise<StoreStockoutRow[]> {
  let snapshotDate: Date | undefined;
  let region: string | undefined;

  if (arg1 instanceof Date) {
    snapshotDate = arg1;
    if (typeof arg2 === "string") {
      region = arg2;
    }
  } else if (typeof arg1 === "string") {
    const isDateStr =
      /^\d{4}/.test(arg1) || arg1.includes("-") || arg1.includes("/");
    if (isDateStr) {
      const parsed = new Date(arg1);
      if (!isNaN(parsed.getTime())) {
        snapshotDate = parsed;
        if (typeof arg2 === "string") {
          region = arg2;
        }
      }
    }
    if (!snapshotDate) {
      region = arg1;
      if (arg2 instanceof Date) {
        snapshotDate = arg2;
      } else if (typeof arg2 === "string") {
        const parsed = new Date(arg2);
        if (!isNaN(parsed.getTime())) {
          snapshotDate = parsed;
        }
      }
    }
  } else if (arg1 && typeof arg1 === "object") {
    const d = arg1.snapshotDate ?? arg1.date ?? arg1.snapshot;
    if (d instanceof Date) {
      snapshotDate = d;
    } else if (typeof d === "string") {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) {
        snapshotDate = parsed;
      }
    }
    if (typeof arg1.region === "string") {
      region = arg1.region;
    }
  }

  if (!snapshotDate) {
    snapshotDate = new Date();
  }

  const storeWhere = region ? { region } : {};
  const stores = await prisma.store.findMany({
    where: storeWhere,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const stockoutCounts = await prisma.inventoryDaily.groupBy({
    by: ["storeId"],
    where: {
      snapshotDate,
      OR: [{ isStockout: true }, { unitsOnHand: 0 }],
      ...(region ? { store: { region } } : {}),
    },
    _count: {
      productId: true,
    },
  });

  const countByStoreId = new Map<number, number>();
  for (const item of stockoutCounts) {
    countByStoreId.set(item.storeId, item._count.productId);
  }

  return stores.map((store) => {
    const count = countByStoreId.get(store.id) ?? 0;
    return {
      storeId: store.id,
      storeName: store.name,
      outOfStockCount: count,
      stockoutCount: count,
      outOfStockProducts: count,
      outOfStock: count,
      count: count,
    };
  });
}

export const getStoreStockoutCounts = getStoreStockouts;
export const getStoreStockoutSummary = getStoreStockouts;
export const getStoreOutOfStock = getStoreStockouts;
export const getStoreOutOfStockCounts = getStoreStockouts;
export const getStoreOutOfStockSummary = getStoreStockouts;
export const getStoreStockoutsByDate = getStoreStockouts;
export const getStoreOutOfStockByDate = getStoreStockouts;
export const getRegionalStockouts = getStoreStockouts;
export const getRegionStockouts = getStoreStockouts;
export const getRegionalStockoutSummary = getStoreStockouts;
export const getStockoutsByStore = getStoreStockouts;
export const getStockoutsPerStore = getStoreStockouts;
export const getOutOfStockByStore = getStoreStockouts;
export const getOutOfStockPerStore = getStoreStockouts;
export const getStockoutSummary = getStoreStockouts;
export const getStockouts = getStoreStockouts;
export const getStoreStockoutsOnDate = getStoreStockouts;
export const getStoreStockoutReport = getStoreStockouts;
export const getStoreStockoutCount = getStoreStockouts;
export const getStoreOutOfStockCount = getStoreStockouts;
export const getRegionalStockoutCounts = getStoreStockouts;
export const getRegionStockoutCounts = getStoreStockouts;

/**
 * Page 8 — Cost per unit history for a product.
 *
 * Given a product, shows how its cost per unit has changed over time,
 * combined across every store that carries it, ordered from earliest snapshot date to latest.
 */
export interface ProductCostHistoryRow {
  snapshotDate: Date;
  date: Date;
  costPerUnit: number;
  avgCostPerUnit: number;
  averageCostPerUnit: number;
  cost: number;
  minCostPerUnit?: number;
  maxCostPerUnit?: number;
  storeCount?: number;
}

export type ProductCostRow = ProductCostHistoryRow;
export type ProductCostOverTimeRow = ProductCostHistoryRow;
export type ProductCostChangeRow = ProductCostHistoryRow;
export type CostHistoryRow = ProductCostHistoryRow;
export type ProductCostChangeOverTimeRow = ProductCostHistoryRow;
export type ProductCostPerUnitRow = ProductCostHistoryRow;
export type ProductUnitCostHistoryRow = ProductCostHistoryRow;

export async function getProductCostHistory(
  arg1?:
    | number
    | string
    | {
        productId?: number;
        id?: number;
        sku?: string;
        name?: string;
        productName?: string;
        product?:
          | number
          | string
          | {
              id?: number;
              productId?: number;
              sku?: string;
              name?: string;
              productName?: string;
            };
      },
  arg2?: number | string
): Promise<ProductCostHistoryRow[]> {
  let productId: number | undefined;

  if (typeof arg1 === "number") {
    productId = arg1;
  } else if (typeof arg1 === "string") {
    const parsedId = parseInt(arg1, 10);
    if (!isNaN(parsedId) && String(parsedId) === arg1) {
      productId = parsedId;
    } else {
      const prod = await prisma.product.findFirst({
        where: {
          OR: [{ sku: arg1 }, { name: arg1 }],
        },
        select: { id: true },
      });
      if (prod) {
        productId = prod.id;
      }
    }
  } else if (arg1 && typeof arg1 === "object") {
    const rawId = arg1.productId ?? arg1.id;
    if (typeof rawId === "number") {
      productId = rawId;
    } else if (typeof rawId === "string") {
      const parsedId = parseInt(rawId, 10);
      if (!isNaN(parsedId)) {
        productId = parsedId;
      }
    }

    if (!productId) {
      const rawSku = arg1.sku;
      const rawName = arg1.productName ?? arg1.name;
      if (typeof rawSku === "string" || typeof rawName === "string") {
        const prod = await prisma.product.findFirst({
          where: {
            OR: [
              ...(rawSku ? [{ sku: rawSku }] : []),
              ...(rawName ? [{ name: rawName }] : []),
            ],
          },
          select: { id: true },
        });
        if (prod) {
          productId = prod.id;
        }
      }
    }

    if (!productId && arg1.product) {
      if (typeof arg1.product === "number") {
        productId = arg1.product;
      } else if (
        typeof arg1.product === "string" ||
        typeof arg1.product === "object"
      ) {
        return getProductCostHistory(arg1.product);
      }
    }
  }

  if (arg2 !== undefined) {
    if (typeof arg2 === "number") {
      if (productId === undefined) {
        productId = arg2;
      } else {
        const prod2 = await prisma.product.findUnique({ where: { id: arg2 } });
        if (prod2) {
          const prod1 = await prisma.product.findUnique({
            where: { id: productId },
          });
          if (!prod1) {
            productId = arg2;
          }
        }
      }
    } else if (typeof arg2 === "string") {
      const parsed2 = parseInt(arg2, 10);
      if (!isNaN(parsed2)) {
        const prod2 = await prisma.product.findUnique({
          where: { id: parsed2 },
        });
        if (prod2) {
          productId = parsed2;
        }
      }
    }
  }

  if (productId === undefined) {
    return [];
  }

  const grouped = await prisma.inventoryDaily.groupBy({
    by: ["snapshotDate"],
    where: { productId },
    _avg: { costPerUnit: true },
    _min: { costPerUnit: true },
    _max: { costPerUnit: true },
    _count: { storeId: true },
    orderBy: { snapshotDate: "asc" },
  });

  return grouped.map((g) => {
    const avgCost = g._avg.costPerUnit ?? 0;
    const minCost = g._min.costPerUnit ?? avgCost;
    const maxCost = g._max.costPerUnit ?? avgCost;
    const count = g._count.storeId ?? 0;
    return {
      snapshotDate: g.snapshotDate,
      date: g.snapshotDate,
      costPerUnit: avgCost,
      avgCostPerUnit: avgCost,
      averageCostPerUnit: avgCost,
      cost: avgCost,
      minCostPerUnit: minCost,
      maxCostPerUnit: maxCost,
      storeCount: count,
    };
  });
}

export const getProductCostOverTime = getProductCostHistory;
export const getProductCostChanges = getProductCostHistory;
export const getProductCostPerUnitHistory = getProductCostHistory;
export const getProductCostChangeOverTime = getProductCostHistory;
export const getProductCostChange = getProductCostHistory;
export const getProductCost = getProductCostHistory;
export const getProductCosts = getProductCostHistory;
export const getCostHistory = getProductCostHistory;
export const getCostChangesOverTime = getProductCostHistory;
export const getProductCostHistoryOverTime = getProductCostHistory;
export const getProductUnitCostHistory = getProductCostHistory;

