import { prisma } from './prisma';
import {
  getStoreCurrentInventory,
  getLowStockAcrossRegion,
  getProductAdjustmentHistory,
  getRegionalSummary,
} from './queries';

async function main() {
  console.log('Seeding test data...');

  const store1 = await prisma.store.create({
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

  const store2 = await prisma.store.create({
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

  const productType = await prisma.productType.create({
    data: { name: 'Electronics' },
  });

  const productFamily = await prisma.productFamily.create({
    data: { name: 'Computers', productTypeId: productType.id },
  });

  const productLine = await prisma.productLine.create({
    data: { name: 'Laptops', productFamilyId: productFamily.id },
  });

  const brand = await prisma.brand.create({
    data: { name: 'TechCorp' },
  });

  const product1 = await prisma.product.create({
    data: {
      sku: 'SKU-LAP-001',
      name: 'UltraBook 15',
      productLineId: productLine.id,
      brandId: brand.id,
    },
  });

  const snapshotDate = new Date('2026-08-01T00:00:00.000Z');

  await prisma.inventoryDaily.create({
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

  await prisma.inventoryDaily.create({
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

  await prisma.inventoryAdjustment.create({
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
  const inventory = await getStoreCurrentInventory('STORE-001');
  console.log(JSON.stringify(inventory, null, 2));

  console.log('\n--- 2. Low Stock Across Region ---');
  const lowStock = await getLowStockAcrossRegion('Northwest');
  console.log(JSON.stringify(lowStock, null, 2));

  console.log('\n--- 3. Adjustment History ---');
  const history = await getProductAdjustmentHistory('STORE-001', 'SKU-LAP-001');
  console.log(JSON.stringify(history, null, 2));

  console.log('\n--- 4. Regional Summary ---');
  const summary = await getRegionalSummary('Northwest', snapshotDate);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
