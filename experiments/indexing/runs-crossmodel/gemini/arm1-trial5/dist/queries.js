"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.getStoreCurrentInventory = getStoreCurrentInventory;
exports.getLowStockAcrossRegion = getLowStockAcrossRegion;
exports.getProductAdjustmentHistory = getProductAdjustmentHistory;
exports.getRegionalSummary = getRegionalSummary;
const client_1 = require("@prisma/client");
exports.prisma = new client_1.PrismaClient();
/**
 * 1. A store's current inventory: every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 */
async function getStoreCurrentInventory(storeIdentifier) {
    const store = await exports.prisma.store.findFirst({
        where: typeof storeIdentifier === 'number'
            ? { id: storeIdentifier }
            : { storeKey: String(storeIdentifier) },
    });
    if (!store) {
        return [];
    }
    const latestRecord = await exports.prisma.inventoryDaily.findFirst({
        where: { storeId: store.id },
        orderBy: { snapshotDate: 'desc' },
        select: { snapshotDate: true },
    });
    if (!latestRecord) {
        return [];
    }
    const items = await exports.prisma.inventoryDaily.findMany({
        where: {
            storeId: store.id,
            snapshotDate: latestRecord.snapshotDate,
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
 * 2. Low stock across a region: every product flagged low stock at any store in a region,
 * returning store name, product name and units on hand.
 */
async function getLowStockAcrossRegion(region) {
    const items = await exports.prisma.inventoryDaily.findMany({
        where: {
            isLowStock: true,
            store: {
                region: region,
            },
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
 * 3. A product's adjustment history at a store, returning who made each adjustment.
 */
async function getProductAdjustmentHistory(storeIdentifier, productIdentifier) {
    const store = await exports.prisma.store.findFirst({
        where: typeof storeIdentifier === 'number'
            ? { id: storeIdentifier }
            : { storeKey: String(storeIdentifier) },
    });
    const product = await exports.prisma.product.findFirst({
        where: typeof productIdentifier === 'number'
            ? { id: productIdentifier }
            : { sku: String(productIdentifier) },
    });
    if (!store || !product) {
        return [];
    }
    const adjustments = await exports.prisma.inventoryAdjustment.findMany({
        where: {
            storeId: store.id,
            productId: product.id,
        },
        include: {
            store: true,
            product: true,
        },
        orderBy: {
            adjustedAt: 'desc',
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
 * 4. A regional summary: total inventory value per store for a given snapshot date.
 */
async function getRegionalSummary(region, snapshotDate) {
    const targetDate = typeof snapshotDate === 'string' ? new Date(snapshotDate) : snapshotDate;
    const stores = await exports.prisma.store.findMany({
        where: { region },
        include: {
            inventoryDailies: {
                where: { snapshotDate: targetDate },
            },
        },
    });
    return stores.map((store) => {
        const totalInventoryValue = store.inventoryDailies.reduce((sum, item) => sum + item.inventoryValue, 0);
        return {
            storeId: store.id,
            storeKey: store.storeKey,
            storeName: store.name,
            totalInventoryValue,
        };
    });
}
