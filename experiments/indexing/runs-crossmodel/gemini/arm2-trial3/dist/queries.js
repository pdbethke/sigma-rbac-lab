"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.getStoreCurrentInventory = getStoreCurrentInventory;
exports.getRegionalLowStock = getRegionalLowStock;
exports.getProductAdjustmentHistory = getProductAdjustmentHistory;
exports.getRegionalInventorySummary = getRegionalInventorySummary;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
exports.prisma = prisma;
/**
 * 1. A store's current inventory:
 * Every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 *
 * @param storeIdentifier - Can be store ID or storeKey
 */
async function getStoreCurrentInventory(storeIdentifier) {
    // Find the store ID first to use optimal direct foreign key indexing
    const store = await prisma.store.findFirst({
        where: {
            OR: [{ id: storeIdentifier }, { storeKey: storeIdentifier }],
        },
        select: { id: true },
    });
    if (!store) {
        return [];
    }
    // Get the latest snapshot date for this store
    const latestSnapshot = await prisma.inventoryDaily.findFirst({
        where: { storeId: store.id },
        orderBy: { snapshotDate: 'desc' },
        select: { snapshotDate: true },
    });
    if (!latestSnapshot) {
        return [];
    }
    const items = await prisma.inventoryDaily.findMany({
        where: {
            storeId: store.id,
            snapshotDate: latestSnapshot.snapshotDate,
        },
        select: {
            unitsOnHand: true,
            product: {
                select: {
                    name: true,
                    brand: {
                        select: { name: true },
                    },
                    productLine: {
                        select: {
                            productFamily: {
                                select: { name: true },
                            },
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
 *
 * @param region - Region name
 * @param snapshotDate - Optional snapshot date. If omitted, uses the latest snapshot date available for stores in the region.
 */
async function getRegionalLowStock(region, snapshotDate) {
    let targetDate = snapshotDate;
    if (!targetDate) {
        const latestSnapshot = await prisma.inventoryDaily.findFirst({
            where: {
                store: { region },
            },
            orderBy: { snapshotDate: 'desc' },
            select: { snapshotDate: true },
        });
        if (!latestSnapshot) {
            return [];
        }
        targetDate = latestSnapshot.snapshotDate;
    }
    const lowStockRecords = await prisma.inventoryDaily.findMany({
        where: {
            isLowStock: true,
            snapshotDate: targetDate,
            store: { region },
        },
        select: {
            unitsOnHand: true,
            store: {
                select: { name: true },
            },
            product: {
                select: { name: true },
            },
        },
    });
    return lowStockRecords.map((record) => ({
        storeName: record.store.name,
        productName: record.product.name,
        unitsOnHand: record.unitsOnHand,
    }));
}
/**
 * 3. A product's adjustment history at a store:
 * Returning who made each adjustment (and adjustment details).
 *
 * @param storeIdentifier - Can be store ID or storeKey
 * @param productIdentifier - Can be product ID or SKU
 */
async function getProductAdjustmentHistory(storeIdentifier, productIdentifier) {
    const store = await prisma.store.findFirst({
        where: {
            OR: [{ id: storeIdentifier }, { storeKey: storeIdentifier }],
        },
        select: { id: true, name: true },
    });
    const product = await prisma.product.findFirst({
        where: {
            OR: [{ id: productIdentifier }, { sku: productIdentifier }],
        },
        select: { id: true, name: true },
    });
    if (!store || !product) {
        return [];
    }
    const adjustments = await prisma.inventoryAdjustment.findMany({
        where: {
            storeId: store.id,
            productId: product.id,
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
        },
    });
    return adjustments.map((adj) => ({
        adjustedBy: adj.adjustedBy,
        adjustedAt: adj.adjustedAt,
        unitsDelta: adj.unitsDelta,
        reason: adj.reason,
        serialNumber: adj.serialNumber,
        storeName: store.name,
        productName: product.name,
    }));
}
/**
 * 4. A regional summary:
 * Total inventory value per store for a given snapshot date.
 *
 * @param region - Region name
 * @param snapshotDate - Snapshot date to summarize
 */
async function getRegionalInventorySummary(region, snapshotDate) {
    const storesInRegion = await prisma.store.findMany({
        where: { region },
        select: { id: true, storeKey: true, name: true },
    });
    if (storesInRegion.length === 0) {
        return [];
    }
    const storeMap = new Map(storesInRegion.map((s) => [s.id, { storeKey: s.storeKey, name: s.name }]));
    const grouped = await prisma.inventoryDaily.groupBy({
        by: ['storeId'],
        where: {
            storeId: { in: Array.from(storeMap.keys()) },
            snapshotDate: snapshotDate,
        },
        _sum: {
            inventoryValue: true,
        },
    });
    return grouped.map((group) => {
        const storeInfo = storeMap.get(group.storeId);
        return {
            storeId: group.storeId,
            storeKey: storeInfo?.storeKey ?? '',
            storeName: storeInfo?.name ?? '',
            totalInventoryValue: group._sum.inventoryValue ?? 0,
        };
    });
}
