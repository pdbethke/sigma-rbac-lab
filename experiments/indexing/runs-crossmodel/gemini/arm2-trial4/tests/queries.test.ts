import { PrismaClient } from '@prisma/client';
import {
  getStoreCurrentInventory,
  getLowStockInRegion,
  getProductAdjustmentHistory,
  getRegionalSummary,
} from '../src/queries';

const prisma = new PrismaClient();

async function runTests() {
  console.log('Running query tests...');

  // 1. Seed test data
  // ProductType
  const productType = await prisma.productType.create({
    data: { name: 'Electronics' },
  });

  // ProductFamily
  const productFamily = await prisma.productFamily.create({
    data: { name: 'Audio', productTypeId: productType.id },
  });

  // ProductLine
  const productLine = await prisma.productLine.create({
    data: { name: 'Headphones', productFamilyId: productFamily.id },
  });

  // Brand
  const brand = await prisma.brand.create({
    data: { name: 'SoundBrand' },
  });

  // Product
  const product1 = await prisma.product.create({
    data: {
      sku: 'SKU-1001',
      name: 'Wireless Headphones',
      productLineId: productLine.id,
      brandId: brand.id,
    },
  });

  const product2 = await prisma.product.create({
    data: {
      sku: 'SKU-1002',
      name: 'Noise Cancelling Headphones',
      productLineId: productLine.id,
      brandId: brand.id,
    },
  });

  // Stores
  const store1 = await prisma.store.create({
    data: {
      storeKey: 'STORE-001',
      name: 'Downtown Tech',
      region: 'North West',
      state: 'WA',
      city: 'Seattle',
      zipCode: '98101',
      latitude: 47.6062,
      longitude: -122.3321,
      tier: 'Tier 1',
    },
  });

  const store2 = await prisma.store.create({
    data: {
      storeKey: 'STORE-002',
      name: 'Suburban Mall',
      region: 'North West',
      state: 'WA',
      city: 'Bellevue',
      zipCode: '98004',
      latitude: 47.6104,
      longitude: -122.2007,
      tier: 'Tier 2',
    },
  });

  const snapshotDate1 = new Date('2026-08-01T00:00:00.000Z');
  const snapshotDate2 = new Date('2026-08-02T00:00:00.000Z');

  // Inventory Daily
  await prisma.inventoryDaily.createMany({
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
        reorderPoint: 10,
        maxStockLevel: 50,
        daysOfSupply: 14.0,
        inventoryValue: 1000.0,
        isStockout: false,
        isLowStock: false,
        lostSalesUnits: 0,
        lostSalesValue: 0.0,
        leadTimeDays: 3,
        merchantId: 'M-101',
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
        reorderPoint: 10,
        maxStockLevel: 50,
        daysOfSupply: 3.5,
        inventoryValue: 250.0,
        isStockout: false,
        isLowStock: true,
        lostSalesUnits: 2,
        lostSalesValue: 100.0,
        leadTimeDays: 3,
        merchantId: 'M-101',
      },
      {
        snapshotDate: snapshotDate2,
        storeId: store2.id,
        productId: product2.id,
        costPerUnit: 100.0,
        unitsOnHand: 15,
        unitsOnOrder: 0,
        unitsInTransit: 0,
        unitsReceived: 0,
        unitsShrunk: 0,
        reorderPoint: 5,
        maxStockLevel: 30,
        daysOfSupply: 20.0,
        inventoryValue: 1500.0,
        isStockout: false,
        isLowStock: false,
        lostSalesUnits: 0,
        lostSalesValue: 0.0,
        leadTimeDays: 2,
        merchantId: 'M-102',
      },
    ],
  });

  // Inventory Adjustments
  await prisma.inventoryAdjustment.create({
    data: {
      storeId: store1.id,
      productId: product1.id,
      adjustedBy: 'Jane Doe (Store Manager)',
      adjustedAt: new Date('2026-08-02T10:30:00.000Z'),
      unitsDelta: -1,
      reason: 'Damaged packaging',
      serialNumber: 'SN-998877',
    },
  });

  // Test Query 1: Store Current Inventory
  console.log('Testing getStoreCurrentInventory...');
  const currentInv = await getStoreCurrentInventory(store1.id, prisma);
  console.log('Current Inventory:', JSON.stringify(currentInv, null, 2));
  if (
    currentInv.length !== 1 ||
    currentInv[0].productName !== 'Wireless Headphones' ||
    currentInv[0].brandName !== 'SoundBrand' ||
    currentInv[0].productFamilyName !== 'Audio' ||
    currentInv[0].unitsOnHand !== 5
  ) {
    throw new Error('Test failed: getStoreCurrentInventory output mismatch');
  }

  // Test Query 2: Low Stock Across Region
  console.log('Testing getLowStockInRegion...');
  const lowStock = await getLowStockInRegion('North West', prisma);
  console.log('Low Stock:', JSON.stringify(lowStock, null, 2));
  if (
    lowStock.length !== 1 ||
    lowStock[0].storeName !== 'Downtown Tech' ||
    lowStock[0].productName !== 'Wireless Headphones' ||
    lowStock[0].unitsOnHand !== 5
  ) {
    throw new Error('Test failed: getLowStockInRegion output mismatch');
  }

  // Test Query 3: Product Adjustment History
  console.log('Testing getProductAdjustmentHistory...');
  const adjustments = await getProductAdjustmentHistory(
    store1.id,
    product1.id,
    prisma
  );
  console.log('Adjustments:', JSON.stringify(adjustments, null, 2));
  if (
    adjustments.length !== 1 ||
    adjustments[0].adjustedBy !== 'Jane Doe (Store Manager)' ||
    adjustments[0].reason !== 'Damaged packaging'
  ) {
    throw new Error('Test failed: getProductAdjustmentHistory output mismatch');
  }

  // Test Query 4: Regional Summary
  console.log('Testing getRegionalSummary...');
  const regionalSummary = await getRegionalSummary(
    'North West',
    snapshotDate2,
    prisma
  );
  console.log('Regional Summary:', JSON.stringify(regionalSummary, null, 2));
  if (regionalSummary.length !== 2) {
    throw new Error('Test failed: getRegionalSummary length mismatch');
  }
  const store1Summary = regionalSummary.find((s) => s.storeId === store1.id);
  const store2Summary = regionalSummary.find((s) => s.storeId === store2.id);
  if (
    !store1Summary ||
    store1Summary.totalInventoryValue !== 250 ||
    !store2Summary ||
    store2Summary.totalInventoryValue !== 1500
  ) {
    throw new Error('Test failed: getRegionalSummary output mismatch');
  }

  console.log('ALL TESTS PASSED SUCCESSFULLY!');
}

runTests()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
