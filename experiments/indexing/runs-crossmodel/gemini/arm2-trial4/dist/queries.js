"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoreCurrentInventory = getStoreCurrentInventory;
exports.getLowStockInRegion = getLowStockInRegion;
exports.getProductAdjustmentHistory = getProductAdjustmentHistory;
exports.getRegionalSummary = getRegionalSummary;
const client_1 = require("@prisma/client");
const globalPrisma = new client_1.PrismaClient();
/**
 * 1. A store's current inventory:
 * Every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name, and units on hand.
 */
async function getStoreCurrentInventory(storeId, prisma = globalPrisma) {
    const latestSnapshot = await prisma.inventoryDaily.findFirst({
        where: { storeId },
        orderBy: { snapshotDate: 'desc' },
        select: { snapshotDate: true },
    });
    if (!latestSnapshot) {
        return [];
    }
    const inventory = await prisma.inventoryDaily.findMany({
        where: {
            storeId,
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
    return inventory.map((item) => ({
        productName: item.product.name,
        brandName: item.product.brand.name,
        productFamilyName: item.product.productLine.productFamily.name,
        unitsOnHand: item.unitsOnHand,
    }));
}
/**
 * 2. Low stock across a region:
 * Every product flagged low stock at any store in a region,
 * returning store name, product name, and units on hand.
 */
async function getLowStockInRegion(region, prisma = globalPrisma) {
    const latestSnapshot = await prisma.inventoryDaily.findFirst({
        where: { store: { region } },
        orderBy: { snapshotDate: 'desc' },
        select: { snapshotDate: true },
    });
    if (!latestSnapshot) {
        return [];
    }
    const lowStockItems = await prisma.inventoryDaily.findMany({
        where: {
            isLowStock: true,
            snapshotDate: latestSnapshot.snapshotDate,
            store: {
                region,
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
    return lowStockItems.map((item) => ({
        storeName: item.store.name,
        productName: item.product.name,
        unitsOnHand: item.unitsOnHand,
    }));
}
/**
 * 3. A product's adjustment history at a store:
 * Returning who made each adjustment (and adjustment details).
 */
async function getProductAdjustmentHistory(storeId, productId, prisma = globalPrisma) {
    const adjustments = await prisma.inventoryAdjustment.findMany({
        where: {
            storeId,
            productId,
        },
        orderBy: {
            adjustedAt: 'desc',
        },
        select: {
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
async function getRegionalSummary(region, snapshotDate, prisma = globalPrisma) {
    const grouped = await prisma.inventoryDaily.groupBy({
        by: ['storeId'],
        where: {
            snapshotDate,
            store: {
                region,
            },
        },
        _sum: {
            inventoryValue: true,
        },
    });
    if (grouped.length === 0) {
        return [];
    }
    const storeIds = grouped.map((g) => g.storeId);
    const stores = await prisma.store.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, name: true },
    });
    const storeMap = new Map(stores.map((s) => [s.id, s.name]));
    return grouped.map((item) => ({
        storeId: item.storeId,
        storeName: storeMap.get(item.storeId) ?? '',
        totalInventoryValue: item._sum.inventoryValue ?? 0,
    }));
}
