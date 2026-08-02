import { PrismaClient } from '@prisma/client';
import {
  getStoreCurrentInventory,
  getLowStockInRegion,
  getProductAdjustmentHistory,
  getRegionalSummary,
} from './queries';

const prisma = new PrismaClient();

async function runTests() {
  console.log('Clearing old test data...');
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.store.deleteMany();

  console.log('Seeding test data...');
  const store1 = await prisma.store.create({
    data: {
      storeKey: 'STORE-101',
      name: 'Downtown Retail',
      region: 'Northwest',
      state: 'WA',
      city: 'Seattle',
      zipCode: '98101',
      latitude: 47.6062,
      longitude: -122.3321,
      tier: 'Flagship',
    },
  });

  const store2 = await prisma.store.create({
    data: {
      storeKey: 'STORE-102',
      name: 'Suburban Retail',
      region: 'Northwest',
      state: 'WA',
      city: 'Bellevue',
      zipCode: '98004',
      latitude: 47.6101,
      longitude: -122.2015,
      tier: 'Standard',
    },
  });

  const pType = await prisma.productType.create({
    data: { name: 'Electronics' },
  });

  const pFamily = await prisma.productFamily.create({
    data: { name: 'Audio Equipment', productTypeId: pType.id },
  });

  const pLine = await prisma.productLine.create({
    data: { name: 'Headphones', productFamilyId: pFamily.id },
  });

  const brand = await prisma.brand.create({
    data: { name: 'SoundBrand' },
  });

  const product1 = await prisma.product.create({
    data: {
      sku: 'SKU-HD-001',
      name: 'Wireless Noise Canceling Headphones',
      productLineId: pLine.id,
      brandId: brand.id,
    },
  });

  const product2 = await prisma.product.create({
    data: {
      sku: 'SKU-HD-002',
      name: 'Earbuds Pro',
      productLineId: pLine.id,
      brandId: brand.id,
    },
  });

  const today = new Date('2026-08-01T00:00:00Z');
  const yesterday = new Date('2026-07-31T00:00:00Z');

  // Insert InventoryDaily
  await prisma.inventoryDaily.create({
    data: {
      snapshotDate: yesterday,
      storeId: store1.id,
      productId: product1.id,
      costPerUnit: 50,
      unitsOnHand: 10,
      unitsOnOrder: 5,
      unitsInTransit: 0,
      unitsReceived: 0,
      unitsShrunk: 0,
      reorderPoint: 5,
      maxStockLevel: 20,
      daysOfSupply: 10,
      inventoryValue: 500,
      isStockout: false,
      isLowStock: false,
      lostSalesUnits: 0,
      lostSalesValue: 0,
      leadTimeDays: 3,
      merchantId: 'MCH-01',
    },
  });

  await prisma.inventoryDaily.create({
    data: {
      snapshotDate: today,
      storeId: store1.id,
      productId: product1.id,
      costPerUnit: 50,
      unitsOnHand: 25,
      unitsOnOrder: 0,
      unitsInTransit: 0,
      unitsReceived: 15,
      unitsShrunk: 0,
      reorderPoint: 5,
      maxStockLevel: 30,
      daysOfSupply: 15,
      inventoryValue: 1250,
      isStockout: false,
      isLowStock: false,
      lostSalesUnits: 0,
      lostSalesValue: 0,
      leadTimeDays: 3,
      merchantId: 'MCH-01',
    },
  });

  await prisma.inventoryDaily.create({
    data: {
      snapshotDate: today,
      storeId: store2.id,
      productId: product2.id,
      costPerUnit: 30,
      unitsOnHand: 2,
      unitsOnOrder: 20,
      unitsInTransit: 10,
      unitsReceived: 0,
      unitsShrunk: 1,
      reorderPoint: 10,
      maxStockLevel: 40,
      daysOfSupply: 1,
      inventoryValue: 60,
      isStockout: false,
      isLowStock: true,
      lostSalesUnits: 5,
      lostSalesValue: 150,
      leadTimeDays: 2,
      merchantId: 'MCH-01',
    },
  });

  // Insert InventoryAdjustment
  await prisma.inventoryAdjustment.create({
    data: {
      storeId: store1.id,
      productId: product1.id,
      adjustedBy: 'Alice Smith',
      adjustedAt: new Date('2026-08-01T10:00:00Z'),
      unitsDelta: 5,
      reason: 'Physical count adjustment',
      serialNumber: 'SN-12345',
    },
  });

  // Test 1: Store current inventory
  console.log('Testing 1: getStoreCurrentInventory...');
  const store1Inv = await getStoreCurrentInventory(store1.id, prisma);
  console.log('Store 1 Inventory:', store1Inv);
  if (
    store1Inv.length !== 1 ||
    store1Inv[0].productName !== 'Wireless Noise Canceling Headphones' ||
    store1Inv[0].brandName !== 'SoundBrand' ||
    store1Inv[0].productFamilyName !== 'Audio Equipment' ||
    store1Inv[0].unitsOnHand !== 25
  ) {
    throw new Error('Test 1 failed');
  }

  // Test 2: Low stock in region
  console.log('Testing 2: getLowStockInRegion...');
  const lowStock = await getLowStockInRegion('Northwest', prisma);
  console.log('Low stock items:', lowStock);
  if (
    lowStock.length !== 1 ||
    lowStock[0].storeName !== 'Suburban Retail' ||
    lowStock[0].productName !== 'Earbuds Pro' ||
    lowStock[0].unitsOnHand !== 2
  ) {
    throw new Error('Test 2 failed');
  }

  // Test 3: Product adjustment history
  console.log('Testing 3: getProductAdjustmentHistory...');
  const history = await getProductAdjustmentHistory(store1.id, product1.id, prisma);
  console.log('Adjustment history:', history);
  if (
    history.length !== 1 ||
    history[0].adjustedBy !== 'Alice Smith' ||
    history[0].unitsDelta !== 5
  ) {
    throw new Error('Test 3 failed');
  }

  // Test 4: Regional summary
  console.log('Testing 4: getRegionalSummary...');
  const summary = await getRegionalSummary('Northwest', today, prisma);
  console.log('Regional summary:', summary);
  if (summary.length !== 2) {
    throw new Error('Test 4 failed');
  }

  console.log('All tests passed successfully!');
}

runTests()
  .catch((e) => {
    console.error('Test failed with error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
