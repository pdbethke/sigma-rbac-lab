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
    // Create store
    const store1 = await queries_1.prisma.store.create({
        data: {
            storeKey: 'STORE-001',
            name: 'Downtown Flagship',
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
            storeKey: 'STORE-002',
            name: 'Bellevue Square',
            region: 'Northwest',
            state: 'WA',
            city: 'Bellevue',
            zipCode: '98004',
            latitude: 47.6101,
            longitude: -122.2015,
            tier: 'Tier 2',
        },
    });
    // Create product hierarchy
    const pType = await queries_1.prisma.productType.create({
        data: { name: 'Electronics' },
    });
    const pFamily = await queries_1.prisma.productFamily.create({
        data: { name: 'Audio Equipment', productTypeId: pType.id },
    });
    const pLine = await queries_1.prisma.productLine.create({
        data: { name: 'Headphones', productFamilyId: pFamily.id },
    });
    const brand = await queries_1.prisma.brand.create({
        data: { name: 'SoundMax' },
    });
    const product1 = await queries_1.prisma.product.create({
        data: {
            sku: 'SKU-1001',
            name: 'Wireless Noise Canceling Headphones',
            productLineId: pLine.id,
            brandId: brand.id,
        },
    });
    const product2 = await queries_1.prisma.product.create({
        data: {
            sku: 'SKU-1002',
            name: 'Bluetooth Earbuds',
            productLineId: pLine.id,
            brandId: brand.id,
        },
    });
    const snapshotDate1 = new Date('2026-08-01T00:00:00.000Z');
    const snapshotDate2 = new Date('2026-08-02T00:00:00.000Z');
    // Insert Inventory Daily records
    await queries_1.prisma.inventoryDaily.createMany({
        data: [
            {
                snapshotDate: snapshotDate1,
                storeId: store1.id,
                productId: product1.id,
                costPerUnit: 50.0,
                unitsOnHand: 20,
                unitsOnOrder: 10,
                unitsInTransit: 0,
                unitsReceived: 5,
                unitsShrunk: 0,
                reorderPoint: 15,
                maxStockLevel: 50,
                daysOfSupply: 10.0,
                inventoryValue: 1000.0,
                isStockout: false,
                isLowStock: false,
                lostSalesUnits: 0,
                lostSalesValue: 0.0,
                leadTimeDays: 3,
                merchantId: 'MCH-001',
            },
            {
                snapshotDate: snapshotDate2,
                storeId: store1.id,
                productId: product1.id,
                costPerUnit: 50.0,
                unitsOnHand: 5,
                unitsOnOrder: 20,
                unitsInTransit: 10,
                unitsReceived: 0,
                unitsShrunk: 1,
                reorderPoint: 15,
                maxStockLevel: 50,
                daysOfSupply: 2.5,
                inventoryValue: 250.0,
                isStockout: false,
                isLowStock: true,
                lostSalesUnits: 2,
                lostSalesValue: 100.0,
                leadTimeDays: 3,
                merchantId: 'MCH-001',
            },
            {
                snapshotDate: snapshotDate2,
                storeId: store1.id,
                productId: product2.id,
                costPerUnit: 30.0,
                unitsOnHand: 40,
                unitsOnOrder: 0,
                unitsInTransit: 0,
                unitsReceived: 0,
                unitsShrunk: 0,
                reorderPoint: 10,
                maxStockLevel: 60,
                daysOfSupply: 20.0,
                inventoryValue: 1200.0,
                isStockout: false,
                isLowStock: false,
                lostSalesUnits: 0,
                lostSalesValue: 0.0,
                leadTimeDays: 2,
                merchantId: 'MCH-001',
            },
            {
                snapshotDate: snapshotDate2,
                storeId: store2.id,
                productId: product1.id,
                costPerUnit: 50.0,
                unitsOnHand: 2,
                unitsOnOrder: 30,
                unitsInTransit: 5,
                unitsReceived: 0,
                unitsShrunk: 0,
                reorderPoint: 10,
                maxStockLevel: 40,
                daysOfSupply: 1.0,
                inventoryValue: 100.0,
                isStockout: false,
                isLowStock: true,
                lostSalesUnits: 5,
                lostSalesValue: 250.0,
                leadTimeDays: 3,
                merchantId: 'MCH-001',
            },
        ],
    });
    // Insert Inventory Adjustments
    await queries_1.prisma.inventoryAdjustment.create({
        data: {
            storeId: store1.id,
            productId: product1.id,
            adjustedBy: 'john_doe',
            adjustedAt: new Date('2026-08-02T10:30:00.000Z'),
            unitsDelta: -1,
            reason: 'Damaged item removed',
            serialNumber: 'SN-998811',
        },
    });
    console.log('Testing Query 1: Store Current Inventory');
    const inventory = await (0, queries_1.getStoreCurrentInventory)(store1.storeKey);
    console.log('Query 1 Result:', JSON.stringify(inventory, null, 2));
    console.log('Testing Query 2: Regional Low Stock');
    const lowStock = await (0, queries_1.getRegionalLowStock)('Northwest', snapshotDate2);
    console.log('Query 2 Result:', JSON.stringify(lowStock, null, 2));
    console.log('Testing Query 3: Product Adjustment History');
    const history = await (0, queries_1.getProductAdjustmentHistory)('STORE-001', 'SKU-1001');
    console.log('Query 3 Result:', JSON.stringify(history, null, 2));
    console.log('Testing Query 4: Regional Summary');
    const summary = await (0, queries_1.getRegionalInventorySummary)('Northwest', snapshotDate2);
    console.log('Query 4 Result:', JSON.stringify(summary, null, 2));
    console.log('All queries executed successfully!');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await queries_1.prisma.$disconnect();
});
