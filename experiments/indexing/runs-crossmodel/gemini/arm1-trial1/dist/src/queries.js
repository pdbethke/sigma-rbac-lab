import { PrismaClient } from '@prisma/client';
const defaultPrisma = new PrismaClient();
function getClient(possibleClient) {
    if (possibleClient && typeof possibleClient === 'object' && 'inventoryDaily' in possibleClient) {
        return possibleClient;
    }
    return defaultPrisma;
}
/**
 * Page 1: A store's current inventory
 * Every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 */
export async function getStoreCurrentInventory(arg1, arg2) {
    let prisma;
    let storeId;
    if (typeof arg1 === 'number') {
        storeId = arg1;
        prisma = getClient(arg2);
    }
    else {
        prisma = getClient(arg1);
        storeId = arg2;
    }
    // Find the latest snapshot date for this store
    const latestSnapshot = await prisma.inventoryDaily.findFirst({
        where: { storeId },
        orderBy: { snapshotDate: 'desc' },
        select: { snapshotDate: true },
    });
    if (!latestSnapshot) {
        return [];
    }
    const items = await prisma.inventoryDaily.findMany({
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
        product: item.product.name,
        brandName: item.product.brand.name,
        brand: item.product.brand.name,
        productFamilyName: item.product.productLine.productFamily.name,
        productFamily: item.product.productLine.productFamily.name,
        unitsOnHand: item.unitsOnHand,
    }));
}
/**
 * Page 2: Low stock across a region
 * Every product flagged low stock at any store in a region,
 * returning store name, product name and units on hand.
 */
export async function getLowStockAcrossRegion(arg1, arg2) {
    let prisma;
    let region;
    if (typeof arg1 === 'string') {
        region = arg1;
        prisma = getClient(arg2);
    }
    else {
        prisma = getClient(arg1);
        region = arg2;
    }
    const items = await prisma.inventoryDaily.findMany({
        where: {
            isLowStock: true,
            store: {
                region,
            },
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
    return items.map((item) => ({
        storeName: item.store.name,
        store: item.store.name,
        productName: item.product.name,
        product: item.product.name,
        unitsOnHand: item.unitsOnHand,
    }));
}
/**
 * Page 3: A product's adjustment history at a store
 * Returning who made each adjustment.
 */
export async function getProductAdjustmentHistoryAtStore(arg1, arg2, arg3) {
    let prisma;
    let storeId;
    let productId;
    if (typeof arg1 === 'number') {
        storeId = arg1;
        productId = arg2;
        prisma = getClient(arg3);
    }
    else {
        prisma = getClient(arg1);
        storeId = arg2;
        productId = arg3;
    }
    const adjustments = await prisma.inventoryAdjustment.findMany({
        where: {
            storeId,
            productId,
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
        ...adj,
        who: adj.adjustedBy,
        adjustedBy: adj.adjustedBy,
    }));
}
/**
 * Page 4: A regional summary
 * Total inventory value per store for a given snapshot date.
 */
export async function getRegionalSummary(arg1, arg2, arg3) {
    let prisma;
    let region;
    let snapshotDate;
    if (typeof arg1 === 'string' && (arg2 instanceof Date || typeof arg2 === 'string')) {
        region = arg1;
        snapshotDate = typeof arg2 === 'string' ? new Date(arg2) : arg2;
        prisma = getClient(arg3);
    }
    else if (arg1 && typeof arg1 === 'object' && 'inventoryDaily' in arg1) {
        prisma = getClient(arg1);
        region = arg2;
        snapshotDate = typeof arg3 === 'string' ? new Date(arg3) : arg3;
    }
    else {
        // Default fallback
        region = arg1;
        snapshotDate = typeof arg2 === 'string' ? new Date(arg2) : arg2;
        prisma = getClient(arg3);
    }
    const stores = await prisma.store.findMany({
        where: { region },
        select: {
            id: true,
            storeKey: true,
            name: true,
            inventoryDailies: {
                where: {
                    snapshotDate,
                },
                select: {
                    inventoryValue: true,
                },
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
            totalValue: totalInventoryValue,
        };
    });
}
// Export convenient aliases
export const getCurrentInventoryForStore = getStoreCurrentInventory;
export const getLowStockByRegion = getLowStockAcrossRegion;
export const getProductAdjustmentHistory = getProductAdjustmentHistoryAtStore;
export const getRegionalInventorySummary = getRegionalSummary;
