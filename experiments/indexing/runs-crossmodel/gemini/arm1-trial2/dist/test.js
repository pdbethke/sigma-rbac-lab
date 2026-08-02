"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("./prisma");
const queries_1 = require("./queries");
async function main() {
    console.log('Seeding test data...');
    const store1 = await prisma_1.prisma.store.create({
        data: {
            storeKey: 'STORE-001',
            name: 'Downtown Superstore',
            region: 'Northwest',
            state: 'WA',
            city: 'Seattle',
            zipCode: '98101',
            latitude: 47.6062,
            longitude: -122.3321,
            tier: 'Tier 1',
        },
    });
    const store2 = await prisma_1.prisma.store.create({
        data: {
            storeKey: 'STORE-002',
            name: 'Suburban Plaza Store',
            region: 'Northwest',
            state: 'WA',
            city: 'Bellevue',
            zipCode: '98004',
            latitude: 47.6101,
            longitude: -122.2015,
            tier: 'Tier 2',
        },
    });
    const productType = await prisma_1.prisma.productType.create({
        data: { name: 'Electronics' },
    });
    const productFamily = await prisma_1.prisma.productFamily.create({
        data: { name: 'Computers', productTypeId: productType.id },
    });
    const productLine = await prisma_1.prisma.productLine.create({
        data: { name: 'Laptops', productFamilyId: productFamily.id },
    });
    const brand = await prisma_1.prisma.brand.create({
        data: { name: 'TechCorp' },
    });
    const product1 = await prisma_1.prisma.product.create({
        data: {
            sku: 'SKU-LAP-001',
            name: 'UltraBook 15',
            productLineId: productLine.id,
            brandId: brand.id,
        },
    });
    const snapshotDate = new Date('2026-08-01T00:00:00.000Z');
    await prisma_1.prisma.inventoryDaily.create({
        data: {
            snapshotDate,
            storeId: store1.id,
            productId: product1.id,
            costPerUnit: 500.0,
            unitsOnHand: 5,
            unitsOnOrder: 10,
            unitsInTransit: 2,
            unitsReceived: 0,
            unitsShrunk: 0,
            reorderPoint: 10,
            maxStockLevel: 50,
            daysOfSupply: 3.5,
            inventoryValue: 2500.0,
            isStockout: false,
            isLowStock: true,
            lostSalesUnits: 0,
            lostSalesValue: 0.0,
            leadTimeDays: 5,
            merchantId: 'M-100',
        },
    });
    await prisma_1.prisma.inventoryDaily.create({
        data: {
            snapshotDate,
            storeId: store2.id,
            productId: product1.id,
            costPerUnit: 500.0,
            unitsOnHand: 25,
            unitsOnOrder: 0,
            unitsInTransit: 0,
            unitsReceived: 0,
            unitsShrunk: 0,
            reorderPoint: 10,
            maxStockLevel: 50,
            daysOfSupply: 15.0,
            inventoryValue: 12500.0,
            isStockout: false,
            isLowStock: false,
            lostSalesUnits: 0,
            lostSalesValue: 0.0,
            leadTimeDays: 5,
            merchantId: 'M-100',
        },
    });
    await prisma_1.prisma.inventoryAdjustment.create({
        data: {
            storeId: store1.id,
            productId: product1.id,
            whoAdjusted: 'Jane Doe',
            adjustedAt: new Date('2026-08-01T14:30:00.000Z'),
            unitsDelta: -1,
            reason: 'Damaged item',
            serialNumber: 'SN-998811',
        },
    });
    console.log('\n--- 1. Current Inventory ---');
    const inventory = await (0, queries_1.getStoreCurrentInventory)('STORE-001');
    console.log(JSON.stringify(inventory, null, 2));
    console.log('\n--- 2. Low Stock Across Region ---');
    const lowStock = await (0, queries_1.getLowStockAcrossRegion)('Northwest');
    console.log(JSON.stringify(lowStock, null, 2));
    console.log('\n--- 3. Adjustment History ---');
    const history = await (0, queries_1.getProductAdjustmentHistory)('STORE-001', 'SKU-LAP-001');
    console.log(JSON.stringify(history, null, 2));
    console.log('\n--- 4. Regional Summary ---');
    const summary = await (0, queries_1.getRegionalSummary)('Northwest', snapshotDate);
    console.log(JSON.stringify(summary, null, 2));
}
main()
    .then(() => prisma_1.prisma.$disconnect())
    .catch((e) => {
    console.error(e);
    prisma_1.prisma.$disconnect();
    process.exit(1);
});
