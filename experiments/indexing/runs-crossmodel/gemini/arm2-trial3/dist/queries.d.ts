import { PrismaClient } from '@prisma/client';
declare const prisma: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
export { prisma };
export interface StoreCurrentInventoryItem {
    productName: string;
    brandName: string;
    productFamilyName: string;
    unitsOnHand: number;
}
export interface RegionalLowStockItem {
    storeName: string;
    productName: string;
    unitsOnHand: number;
}
export interface ProductAdjustmentHistoryItem {
    adjustedBy: string;
    adjustedAt: Date;
    unitsDelta: number;
    reason: string;
    serialNumber: string | null;
    storeName: string;
    productName: string;
}
export interface RegionalInventorySummaryItem {
    storeId: string;
    storeKey: string;
    storeName: string;
    totalInventoryValue: number;
}
/**
 * 1. A store's current inventory:
 * Every product held at one store on the latest snapshot date,
 * returning product name, brand name, product family name and units on hand.
 *
 * @param storeIdentifier - Can be store ID or storeKey
 */
export declare function getStoreCurrentInventory(storeIdentifier: string): Promise<StoreCurrentInventoryItem[]>;
/**
 * 2. Low stock across a region:
 * Every product flagged low stock at any store in a region,
 * returning store name, product name and units on hand.
 *
 * @param region - Region name
 * @param snapshotDate - Optional snapshot date. If omitted, uses the latest snapshot date available for stores in the region.
 */
export declare function getRegionalLowStock(region: string, snapshotDate?: Date): Promise<RegionalLowStockItem[]>;
/**
 * 3. A product's adjustment history at a store:
 * Returning who made each adjustment (and adjustment details).
 *
 * @param storeIdentifier - Can be store ID or storeKey
 * @param productIdentifier - Can be product ID or SKU
 */
export declare function getProductAdjustmentHistory(storeIdentifier: string, productIdentifier: string): Promise<ProductAdjustmentHistoryItem[]>;
/**
 * 4. A regional summary:
 * Total inventory value per store for a given snapshot date.
 *
 * @param region - Region name
 * @param snapshotDate - Snapshot date to summarize
 */
export declare function getRegionalInventorySummary(region: string, snapshotDate: Date): Promise<RegionalInventorySummaryItem[]>;
