import { PrismaClient } from '@prisma/client';
/**
 * 1. A store's current inventory:
 * Every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 */
export declare function getStoreCurrentInventory(storeId: number | string, prisma?: PrismaClient): Promise<{
    productName: string;
    brandName: string;
    productFamilyName: string;
    unitsOnHand: number;
}[]>;
/**
 * 2. Low stock across a region:
 * Every product flagged low stock at any store in a region,
 * returning store name, product name and units on hand.
 */
export declare function getLowStockByRegion(region: string, prisma?: PrismaClient): Promise<{
    storeName: string;
    productName: string;
    unitsOnHand: number;
}[]>;
/**
 * 3. A product's adjustment history at a store:
 * Returning who made each adjustment.
 */
export declare function getProductAdjustmentHistory(storeId: number | string, productId: number | string, prisma?: PrismaClient): Promise<{
    whoAdjusted: string;
    adjustedBy: string;
    when: Date;
    unitsDelta: number;
    reason: string;
    serialNumber: string;
}[]>;
/**
 * 4. A regional summary:
 * Total inventory value per store for a given snapshot date.
 */
export declare function getRegionalInventorySummary(region: string, snapshotDate: Date | string, prisma?: PrismaClient): Promise<{
    storeId: number;
    storeKey: string;
    storeName: string;
    totalInventoryValue: number;
}[]>;
