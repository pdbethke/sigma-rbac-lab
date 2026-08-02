import { PrismaClient } from '@prisma/client';
import {
  getStoreCurrentInventory,
  getLowStockAcrossRegion,
  getProductAdjustmentHistory,
  getRegionalSummary
} from './queries';

const prisma = new PrismaClient();

async function runTests() {
  console.log('Seeding test data...');

  // Clean up existing test data
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.store.deleteMany();

  // 1. Create Store
  const store = await prisma.store.create({
    data: {
      storeKey: 'STORE_001',
      name: 'Downtown Store',
      region: 'Northeast',
      state: 'NY',
      city: 'New York',
      zipCode: '10001',
      latitude: 40.7128,
      longitude: -74.006,
      tier: 'Tier 1'
    }
  });

  // 2. Create Product Hierarchy
  const pType = await prisma.productType.create({
    data: { name: 'Electronics' }
  });

  const pFamily = await prisma.productFamily.create({
    data: {
      name: 'Audio',
      productTypeId: pType.id
    }
  });

  const pLine = await prisma.productLine.create({
    data: {
      name: 'Headphones',
      productFamilyId: pFamily.id
    }
  });

  const brand = await prisma.brand.create({
    data: { name: 'SoundMaster' }
  });

  const product = await prisma.product.create({
    data: {
      sku: 'SKU-HEADSET-1',
      name: 'Wireless Noise Canceling Headphones',
      productLineId: pLine.id,
      brandId: brand.id
    }
  });

  // 3. Create Daily Inventories (two snapshot dates)
  const date1 = new Date('2026-08-01T00:00:00.000Z');
  const date2 = new Date('2026-08-02T00:00:00.000Z');

  await prisma.inventoryDaily.create({
    data: {
      snapshotDate: date1,
      storeId: store.id,
      productId: product.id,
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
      merchantId: 'M101'
    }
  });

  await prisma.inventoryDaily.create({
    data: {
      snapshotDate: date2,
      storeId: store.id,
      productId: product.id,
      costPerUnit: 50.0,
      unitsOnHand: 5,
      unitsOnOrder: 10,
      unitsInTransit: 0,
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
      merchantId: 'M101'
    }
  });

  // 4. Create Inventory Adjustment
  await prisma.inventoryAdjustment.create({
    data: {
      storeId: store.id,
      productId: product.id,
      adjustedBy: 'Alice Smith',
      adjustedAt: new Date('2026-08-02T10:00:00.000Z'),
      unitsDelta: -1,
      reason: 'Damaged packaging',
      serialNumber: 'SN123456'
    }
  });

  console.log('Testing Query 1: getStoreCurrentInventory');
  const query1Result = await getStoreCurrentInventory(store.storeKey);
  console.log('Query 1 Result:', JSON.stringify(query1Result, null, 2));

  if (
    query1Result.length !== 1 ||
    query1Result[0].productName !== 'Wireless Noise Canceling Headphones' ||
    query1Result[0].brandName !== 'SoundMaster' ||
    query1Result[0].productFamilyName !== 'Audio' ||
    query1Result[0].unitsOnHand !== 5
  ) {
    throw new Error('Query 1 verification failed!');
  }

  console.log('Testing Query 2: getLowStockAcrossRegion');
  const query2Result = await getLowStockAcrossRegion('Northeast');
  console.log('Query 2 Result:', JSON.stringify(query2Result, null, 2));

  if (
    query2Result.length !== 1 ||
    query2Result[0].storeName !== 'Downtown Store' ||
    query2Result[0].productName !== 'Wireless Noise Canceling Headphones' ||
    query2Result[0].unitsOnHand !== 5
  ) {
    throw new Error('Query 2 verification failed!');
  }

  console.log('Testing Query 3: getProductAdjustmentHistory');
  const query3Result = await getProductAdjustmentHistory(store.storeKey, product.sku);
  console.log('Query 3 Result:', JSON.stringify(query3Result, null, 2));

  if (
    query3Result.length !== 1 ||
    query3Result[0].adjustedBy !== 'Alice Smith' ||
    query3Result[0].unitsDelta !== -1
  ) {
    throw new Error('Query 3 verification failed!');
  }

  console.log('Testing Query 4: getRegionalSummary');
  const query4Result = await getRegionalSummary('Northeast', '2026-08-02T00:00:00.000Z');
  console.log('Query 4 Result:', JSON.stringify(query4Result, null, 2));

  if (
    query4Result.length !== 1 ||
    query4Result[0].storeName !== 'Downtown Store' ||
    query4Result[0].totalInventoryValue !== 250.0
  ) {
    throw new Error('Query 4 verification failed!');
  }

  console.log('All 4 queries verified successfully!');
}

runTests()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
