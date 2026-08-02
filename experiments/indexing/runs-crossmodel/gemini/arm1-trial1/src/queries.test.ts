import { PrismaClient } from '@prisma/client';
import {
  getStoreCurrentInventory,
  getLowStockAcrossRegion,
  getProductAdjustmentHistoryAtStore,
  getRegionalSummary,
} from './queries.js';

const prisma = new PrismaClient();

async function runTests() {
  console.log('Cleaning database...');
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.store.deleteMany();

  console.log('Seeding test data...');
  // 1. Create Stores
  const store1 = await prisma.store.create({
    data: {
      storeKey: 'ST-101',
      name: 'Downtown Store',
      region: 'North',
      state: 'NY',
      city: 'New York',
      zipCode: '10001',
      latitude: 40.7128,
      longitude: -74.006,
      tier: 'Tier 1',
    },
  });

  const store2 = await prisma.store.create({
    data: {
      storeKey: 'ST-102',
      name: 'Uptown Store',
      region: 'North',
      state: 'NY',
      city: 'New York',
      zipCode: '10024',
      latitude: 40.7831,
      longitude: -73.9712,
      tier: 'Tier 2',
    },
  });

  const store3 = await prisma.store.create({
    data: {
      storeKey: 'ST-201',
      name: 'South Store',
      region: 'South',
      state: 'FL',
      city: 'Miami',
      zipCode: '33101',
      latitude: 25.7617,
      longitude: -80.1918,
      tier: 'Tier 1',
    },
  });

  // 2. Product Hierarchy & Brand
  const productType = await prisma.productType.create({
    data: { name: 'Electronics' },
  });

  const productFamily = await prisma.productFamily.create({
    data: { name: 'Audio', productTypeId: productType.id },
  });

  const productLine = await prisma.productLine.create({
    data: { name: 'Headphones', productFamilyId: productFamily.id },
  });

  const brand = await prisma.brand.create({
    data: { name: 'SoundBrand' },
  });

  const product1 = await prisma.product.create({
    data: {
      sku: 'SKU-HEADPHONE-01',
      name: 'Wireless Headphones',
      productLineId: productLine.id,
      brandId: brand.id,
    },
  });

  const product2 = await prisma.product.create({
    data: {
      sku: 'SKU-HEADPHONE-02',
      name: 'Noise Canceling Headphones',
      productLineId: productLine.id,
      brandId: brand.id,
    },
  });

  // Dates
  const date1 = new Date('2026-08-01T00:00:00.000Z');
  const date2 = new Date('2026-08-02T00:00:00.000Z');

  // 3. InventoryDaily records
  await prisma.inventoryDaily.createMany({
    data: [
      {
        snapshotDate: date1,
        storeId: store1.id,
        productId: product1.id,
        costPerUnit: 50.0,
        unitsOnHand: 20,
        unitsOnOrder: 10,
        unitsInTransit: 0,
        unitsReceived: 5,
        unitsShrunk: 0,
        reorderPoint: 5,
        maxStockLevel: 50,
        daysOfSupply: 10,
        inventoryValue: 1000.0,
        isStockout: false,
        isLowStock: false,
        lostSalesUnits: 0,
        lostSalesValue: 0,
        leadTimeDays: 3,
        merchantId: 'M-001',
      },
      {
        snapshotDate: date2, // Latest date for store1
        storeId: store1.id,
        productId: product1.id,
        costPerUnit: 50.0,
        unitsOnHand: 2,
        unitsOnOrder: 20,
        unitsInTransit: 0,
        unitsReceived: 0,
        unitsShrunk: 1,
        reorderPoint: 5,
        maxStockLevel: 50,
        daysOfSupply: 1,
        inventoryValue: 100.0,
        isStockout: false,
        isLowStock: true, // Flagged low stock
        lostSalesUnits: 0,
        lostSalesValue: 0,
        leadTimeDays: 3,
        merchantId: 'M-001',
      },
      {
        snapshotDate: date2,
        storeId: store1.id,
        productId: product2.id,
        costPerUnit: 100.0,
        unitsOnHand: 15,
        unitsOnOrder: 0,
        unitsInTransit: 0,
        unitsReceived: 0,
        unitsShrunk: 0,
        reorderPoint: 5,
        maxStockLevel: 30,
        daysOfSupply: 7,
        inventoryValue: 1500.0,
        isStockout: false,
        isLowStock: false,
        lostSalesUnits: 0,
        lostSalesValue: 0,
        leadTimeDays: 5,
        merchantId: 'M-001',
      },
      {
        snapshotDate: date2,
        storeId: store2.id,
        productId: product1.id,
        costPerUnit: 50.0,
        unitsOnHand: 1,
        unitsOnOrder: 10,
        unitsInTransit: 0,
        unitsReceived: 0,
        unitsShrunk: 0,
        reorderPoint: 5,
        maxStockLevel: 25,
        daysOfSupply: 0.5,
        inventoryValue: 50.0,
        isStockout: false,
        isLowStock: true, // Flagged low stock
        lostSalesUnits: 0,
        lostSalesValue: 0,
        leadTimeDays: 3,
        merchantId: 'M-001',
      },
      {
        snapshotDate: date2,
        storeId: store3.id,
        productId: product2.id,
        costPerUnit: 100.0,
        unitsOnHand: 25,
        unitsOnOrder: 0,
        unitsInTransit: 0,
        unitsReceived: 0,
        unitsShrunk: 0,
        reorderPoint: 5,
        maxStockLevel: 40,
        daysOfSupply: 12,
        inventoryValue: 2500.0,
        isStockout: false,
        isLowStock: false,
        lostSalesUnits: 0,
        lostSalesValue: 0,
        leadTimeDays: 5,
        merchantId: 'M-001',
      },
    ],
  });

  // 4. Inventory Adjustments
  await prisma.inventoryAdjustment.create({
    data: {
      storeId: store1.id,
      productId: product1.id,
      adjustedBy: 'Alice Smith',
      adjustedAt: new Date('2026-08-02T10:00:00.000Z'),
      unitsDelta: -1,
      reason: 'Damaged item',
      serialNumber: 'SN-10001',
    },
  });

  await prisma.inventoryAdjustment.create({
    data: {
      storeId: store1.id,
      productId: product1.id,
      adjustedBy: 'Bob Jones',
      adjustedAt: new Date('2026-08-02T14:30:00.000Z'),
      unitsDelta: 5,
      reason: 'Stock count correction',
      serialNumber: null,
    },
  });

  console.log('\n--- Testing Query 1: Store Current Inventory ---');
  const store1Inventory = await getStoreCurrentInventory(prisma, store1.id);
  console.log(JSON.stringify(store1Inventory, null, 2));

  if (store1Inventory.length !== 2) {
    throw new Error(`Expected 2 products for store1 current inventory, got ${store1Inventory.length}`);
  }

  console.log('\n--- Testing Query 2: Low Stock Across Region ---');
  const lowStockNorth = await getLowStockAcrossRegion(prisma, 'North');
  console.log(JSON.stringify(lowStockNorth, null, 2));

  if (lowStockNorth.length !== 2) {
    throw new Error(`Expected 2 low stock items in North region, got ${lowStockNorth.length}`);
  }

  console.log('\n--- Testing Query 3: Product Adjustment History ---');
  const adjustments = await getProductAdjustmentHistoryAtStore(prisma, store1.id, product1.id);
  console.log(JSON.stringify(adjustments, null, 2));

  if (adjustments.length !== 2) {
    throw new Error(`Expected 2 adjustments, got ${adjustments.length}`);
  }

  console.log('\n--- Testing Query 4: Regional Summary ---');
  const regionalSummary = await getRegionalSummary(prisma, 'North', date2);
  console.log(JSON.stringify(regionalSummary, null, 2));

  if (regionalSummary.length !== 2) {
    throw new Error(`Expected 2 stores in regional summary for North, got ${regionalSummary.length}`);
  }

  console.log('\nALL TESTS PASSED SUCCESSFULLY!');
}

runTests()
  .catch((e) => {
    console.error('Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
