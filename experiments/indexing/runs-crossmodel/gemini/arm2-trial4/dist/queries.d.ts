import { PrismaClient } from '@prisma/client';
export interface StoreCurrentInventoryItem {
    productName: string;
    brandName: string;
    productFamilyName: string;
    unitsOnHand: number;
}
export interface LowStockRegionItem {
    storeName: string;
    productName: string;
    unitsOnHand: number;
}
export interface AdjustmentHistoryItem {
    adjustedBy: string;
    adjustedAt: Date;
    unitsDelta: number;
    reason: string;
    serialNumber: string | null;
    storeName: string;
    productName: string;
}
export interface RegionalSummaryItem {
    storeId: number;
    storeName: string;
    totalInventoryValue: number;
}
/**
 * 1. A store's current inventory:
 * Every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name, and units on hand.
 */
export declare function getStoreCurrentInventory(storeId: number, prisma?: PrismaClient): Promise<StoreCurrentInventoryItem[]>;
/**
 * 2. Low stock across a region:
 * Every product flagged low stock at any store in a region,
 * returning store name, product name, and units on hand.
 */
export declare function getLowStockInRegion(region: string, prisma?: PrismaClient): Promise<LowStockRegionItem[]>;
/**
 * 3. A product's adjustment history at a store:
 * Returning who made each adjustment (and adjustment details).
 */
export declare function getProductAdjustmentHistory(storeId: number, productId: number, prisma?: PrismaClient): Promise<AdjustmentHistoryItem[]>;
/**
 * 4. A regional summary:
 * Total inventory value per store for a given snapshot date.
 */
export declare function getRegionalSummary(region: string, snapshotDate: Date, prisma?: PrismaClient): Promise<RegionalSummaryItem[]>;
