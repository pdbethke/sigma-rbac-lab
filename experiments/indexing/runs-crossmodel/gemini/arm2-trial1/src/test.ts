import { PrismaClient } from '@prisma/client';
import {
  getStoreCurrentInventory,
  getLowStockByRegion,
  getProductAdjustmentHistory,
  getRegionalInventorySummary,
} from './queries';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up existing data...');
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.store.deleteMany();

  console.log('Seeding test data...');

  // Create Store
  const store1 = await prisma.store.create({
    data: {
      storeKey: 'STR001',
      name: 'Downtown Main',
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
      storeKey: 'STR002',
      name: 'Uptown Express',
      region: 'North',
      state: 'NY',
      city: 'New York',
      zipCode: '10021',
      latitude: 40.7736,
      longitude: -73.9566,
      tier: 'Tier 2',
    },
  });

  // Create Product Hierarchy
  const prodType = await prisma.productType.create({
    data: { name: 'Electronics' },
  });

  const prodFamily = await prisma.productFamily.create({
    data: {
      name: 'Audio',
      productTypeId: prodType.id,
    },
  });

  const prodLine = await prisma.productLine.create({
    data: {
      name: 'Headphones',
      productFamilyId: prodFamily.id,
    },
  });

  const brand = await prisma.brand.create({
    data: { name: 'SoundMax' },
  });

  const product1 = await prisma.product.create({
    data: {
      sku: 'SKU-101',
      name: 'Wireless Headphones Pro',
      productLineId: prodLine.id,
      brandId: brand.id,
    },
  });

  const product2 = await prisma.product.create({
    data: {
      sku: 'SKU-102',
      name: 'Noise Cancelling Earbuds',
      productLineId: prodLine.id,
      brandId: brand.id,
    },
  });

  // Inventory Daily
  const snapshotDate1 = new Date('2026-08-01T00:00:00.000Z');
  const snapshotDate2 = new Date('2026-08-02T00:00:00.000Z');

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
        reorderPoint: 5,
        maxStockLevel: 50,
        daysOfSupply: 10,
        inventoryValue: 1000.0,
        isStockout: false,
        isLowStock: false,
        lostSalesUnits: 0,
        lostSalesValue: 0,
        leadTimeDays: 3,
        merchantId: 'M100',
      },
      {
        snapshotDate: snapshotDate2,
        storeId: store1.id,
        productId: product1.id,
        costPerUnit: 50.0,
        unitsOnHand: 2,
        unitsOnOrder: 20,
        unitsInTransit: 10,
        unitsReceived: 0,
        unitsShrunk: 1,
        reorderPoint: 5,
        maxStockLevel: 50,
        daysOfSupply: 1,
        inventoryValue: 100.0,
        isStockout: false,
        isLowStock: true,
        lostSalesUnits: 3,
        lostSalesValue: 150.0,
        leadTimeDays: 3,
        merchantId: 'M100',
      },
      {
        snapshotDate: snapshotDate2,
        storeId: store2.id,
        productId: product2.id,
        costPerUnit: 30.0,
        unitsOnHand: 15,
        unitsOnOrder: 0,
        unitsInTransit: 0,
        unitsReceived: 0,
        unitsShrunk: 0,
        reorderPoint: 5,
        maxStockLevel: 30,
        daysOfSupply: 8,
        inventoryValue: 450.0,
        isStockout: false,
        isLowStock: false,
        lostSalesUnits: 0,
        lostSalesValue: 0,
        leadTimeDays: 2,
        merchantId: 'M101',
      },
    ],
  });

  // Adjustments
  await prisma.inventoryAdjustment.create({
    data: {
      storeId: store1.id,
      productId: product1.id,
      whoAdjusted: 'Alice Johnson',
      when: new Date('2026-08-01T14:30:00Z'),
      unitsDelta: -1,
      reason: 'Damaged packaging',
      serialNumber: 'SN-987654',
    },
  });

  console.log('\n--- Query 1: Store Current Inventory ---');
  const inv1 = await getStoreCurrentInventory(store1.id, prisma);
  console.log(JSON.stringify(inv1, null, 2));

  console.log('\n--- Query 2: Low Stock Across Region ---');
  const lowStock = await getLowStockByRegion('North', prisma);
  console.log(JSON.stringify(lowStock, null, 2));

  console.log('\n--- Query 3: Product Adjustment History ---');
  const history = await getProductAdjustmentHistory(store1.id, product1.id, prisma);
  console.log(JSON.stringify(history, null, 2));

  console.log('\n--- Query 4: Regional Summary ---');
  const summary = await getRegionalInventorySummary('North', snapshotDate2, prisma);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
