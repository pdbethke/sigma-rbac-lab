"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const queries_1 = require("./queries");
async function main() {
    console.log('Seeding test data...');
    // Clean up existing data
    await queries_1.prisma.inventoryAdjustment.deleteMany();
    await queries_1.prisma.inventoryDaily.deleteMany();
    await queries_1.prisma.product.deleteMany();
    await queries_1.prisma.brand.deleteMany();
    await queries_1.prisma.productLine.deleteMany();
    await queries_1.prisma.productFamily.deleteMany();
    await queries_1.prisma.productType.deleteMany();
    await queries_1.prisma.store.deleteMany();
    // 1. Create Store
    const store1 = await queries_1.prisma.store.create({
        data: {
            storeKey: 'STORE_001',
            name: 'Downtown Megastore',
            region: 'Northwest',
            state: 'WA',
            city: 'Seattle',
            zipCode: '98101',
            latitude: 47.6062,
            longitude: -122.3321,
            tier: 'Tier 1',
        },
    });
    const store2 = await queries_1.prisma.store.create({
        data: {
            storeKey: 'STORE_002',
            name: 'Suburban Plaza',
            region: 'Northwest',
            state: 'WA',
            city: 'Bellevue',
            zipCode: '98004',
            latitude: 47.6101,
            longitude: -122.2015,
            tier: 'Tier 2',
        },
    });
    // 2. Product Hierarchy & Brand
    const productType = await queries_1.prisma.productType.create({
        data: { name: 'Electronics' },
    });
    const productFamily = await queries_1.prisma.productFamily.create({
        data: { name: 'Audio Systems', productTypeId: productType.id },
    });
    const productLine = await queries_1.prisma.productLine.create({
        data: { name: 'Wireless Headphones', productFamilyId: productFamily.id },
    });
    const brand = await queries_1.prisma.brand.create({
        data: { name: 'SoundMaster' },
    });
    const product = await queries_1.prisma.product.create({
        data: {
            sku: 'SKU-HEADSET-001',
            name: 'SoundMaster Noise-Canceling Headphones',
            productLineId: productLine.id,
            brandId: brand.id,
        },
    });
    // 3. Create Daily Inventory Snapshots
    const snapDate1 = new Date('2026-08-01T00:00:00.000Z');
    const snapDate2 = new Date('2026-08-02T00:00:00.000Z');
    await queries_1.prisma.inventoryDaily.create({
        data: {
            snapshotDate: snapDate1,
            storeId: store1.id,
            productId: product.id,
            costPerUnit: 150.0,
            unitsOnHand: 50,
            unitsOnOrder: 20,
            unitsInTransit: 0,
            unitsReceived: 10,
            unitsShrunk: 1,
            reorderPoint: 15,
            maxStockLevel: 100,
            daysOfSupply: 10.5,
            inventoryValue: 7500.0,
            isStockout: false,
            isLowStock: false,
            lostSalesUnits: 0,
            lostSalesValue: 0,
            leadTimeDays: 3,
            merchantId: 'MERCH-101',
        },
    });
    await queries_1.prisma.inventoryDaily.create({
        data: {
            snapshotDate: snapDate2,
            storeId: store1.id,
            productId: product.id,
            costPerUnit: 150.0,
            unitsOnHand: 5,
            unitsOnOrder: 50,
            unitsInTransit: 20,
            unitsReceived: 0,
            unitsShrunk: 0,
            reorderPoint: 15,
            maxStockLevel: 100,
            daysOfSupply: 1.2,
            inventoryValue: 750.0,
            isStockout: false,
            isLowStock: true,
            lostSalesUnits: 2,
            lostSalesValue: 500.0,
            leadTimeDays: 3,
            merchantId: 'MERCH-101',
        },
    });
    await queries_1.prisma.inventoryDaily.create({
        data: {
            snapshotDate: snapDate2,
            storeId: store2.id,
            productId: product.id,
            costPerUnit: 150.0,
            unitsOnHand: 40,
            unitsOnOrder: 0,
            unitsInTransit: 0,
            unitsReceived: 0,
            unitsShrunk: 0,
            reorderPoint: 10,
            maxStockLevel: 80,
            daysOfSupply: 8.0,
            inventoryValue: 6000.0,
            isStockout: false,
            isLowStock: false,
            lostSalesUnits: 0,
            lostSalesValue: 0,
            leadTimeDays: 2,
            merchantId: 'MERCH-101',
        },
    });
    // 4. Create Inventory Adjustment
    await queries_1.prisma.inventoryAdjustment.create({
        data: {
            storeId: store1.id,
            productId: product.id,
            adjustedBy: 'Alice Smith (Manager)',
            unitsDelta: -2,
            reason: 'Damaged packaging during shelf restock',
            serialNumber: 'SN-9988221',
        },
    });
    console.log('Testing Query 1: Store Current Inventory');
    const currentInv = await (0, queries_1.getStoreCurrentInventory)('STORE_001');
    console.log(JSON.stringify(currentInv, null, 2));
    console.log('\nTesting Query 2: Low Stock Across Region');
    const lowStock = await (0, queries_1.getLowStockAcrossRegion)('Northwest');
    console.log(JSON.stringify(lowStock, null, 2));
    console.log('\nTesting Query 3: Product Adjustment History');
    const adjHistory = await (0, queries_1.getProductAdjustmentHistory)('STORE_001', 'SKU-HEADSET-001');
    console.log(JSON.stringify(adjHistory, null, 2));
    console.log('\nTesting Query 4: Regional Summary');
    const regSummary = await (0, queries_1.getRegionalSummary)('Northwest', snapDate2);
    console.log(JSON.stringify(regSummary, null, 2));
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await queries_1.prisma.$disconnect();
});
