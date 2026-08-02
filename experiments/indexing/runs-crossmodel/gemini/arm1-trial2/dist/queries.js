"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoreCurrentInventory = getStoreCurrentInventory;
exports.getLowStockAcrossRegion = getLowStockAcrossRegion;
exports.getProductAdjustmentHistory = getProductAdjustmentHistory;
exports.getRegionalSummary = getRegionalSummary;
const prisma_1 = require("./prisma");
/**
 * 1. A store's current inventory:
 * Every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 */
async function getStoreCurrentInventory(storeKey) {
    const latestSnapshot = await prisma_1.prisma.inventoryDaily.findFirst({
        where: {
            store: { storeKey },
        },
        orderBy: {
            snapshotDate: 'desc',
        },
        select: {
            snapshotDate: true,
        },
    });
    if (!latestSnapshot) {
        return [];
    }
    const items = await prisma_1.prisma.inventoryDaily.findMany({
        where: {
            store: { storeKey },
            snapshotDate: latestSnapshot.snapshotDate,
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
 * 2. Low stock across a region:
 * Every product flagged low stock at any store in a region,
 * returning store name, product name and units on hand.
 */
async function getLowStockAcrossRegion(region) {
    const items = await prisma_1.prisma.inventoryDaily.findMany({
        where: {
            isLowStock: true,
            store: { region },
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
 * 3. A product's adjustment history at a store:
 * Returning who made each adjustment (and adjustment details).
 */
async function getProductAdjustmentHistory(storeKey, sku) {
    const adjustments = await prisma_1.prisma.inventoryAdjustment.findMany({
        where: {
            store: { storeKey },
            product: { sku },
        },
        orderBy: {
            adjustedAt: 'desc',
        },
        include: {
            store: true,
            product: true,
        },
    });
    return adjustments.map((adj) => ({
        id: adj.id,
        storeName: adj.store.name,
        productName: adj.product.name,
        whoAdjusted: adj.whoAdjusted,
        adjustedAt: adj.adjustedAt,
        unitsDelta: adj.unitsDelta,
        reason: adj.reason,
        serialNumber: adj.serialNumber,
    }));
}
/**
 * 4. A regional summary:
 * Total inventory value per store for a given snapshot date.
 */
async function getRegionalSummary(region, snapshotDate) {
    const targetDate = typeof snapshotDate === 'string' ? new Date(snapshotDate) : snapshotDate;
    const stores = await prisma_1.prisma.store.findMany({
        where: { region },
        select: {
            id: true,
            storeKey: true,
            name: true,
            inventoryDaily: {
                where: { snapshotDate: targetDate },
                select: { inventoryValue: true },
            },
        },
    });
    return stores.map((store) => {
        const totalInventoryValue = store.inventoryDaily.reduce((sum, item) => sum + item.inventoryValue, 0);
        return {
            storeKey: store.storeKey,
            storeName: store.name,
            totalInventoryValue,
        };
    });
}
