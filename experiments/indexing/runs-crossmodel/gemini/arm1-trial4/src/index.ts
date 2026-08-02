import { PrismaClient } from '@prisma/client';
import {
  getStoreCurrentInventory,
  getLowStockAcrossRegion,
  getProductAdjustmentHistory,
  getRegionalSummary,
} from './queries';

async function main() {
  const prisma = new PrismaClient();

  // Ensure DB schema is up to date
  console.log('Seeding test data...');

  // Create store
  const store = await prisma.store.create({
    data: {
      storeKey: 'STORE-001',
      name: 'Downtown Main',
      region: 'West',
      state: 'CA',
      city: 'San Francisco',
      zipCode: '94105',
      latitude: 37.7749,
      longitude: -122.4194,
      tier: 'Flagship',
    },
  });

  // Create ProductType -> ProductFamily -> ProductLine -> Brand -> Product
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
    data: { name: 'SoundMaster' },
  });

  const product = await prisma.product.create({
    data: {
      sku: 'SKU-1001',
      name: 'Wireless Noise Canceling Headphones',
      productLineId: productLine.id,
      brandId: brand.id,
    },
  });

  const snapshotDate = new Date('2026-08-01T00:00:00.000Z');

  // Create InventoryDaily
  await prisma.inventoryDaily.create({
    data: {
      snapshotDate,
      storeId: store.id,
      productId: product.id,
      costPerUnit: 150.0,
      unitsOnHand: 5,
      unitsOnOrder: 20,
      unitsInTransit: 0,
      unitsReceived: 10,
      unitsShrunk: 1,
      reorderPoint: 10,
      maxStockLevel: 50,
      daysOfSupply: 3.5,
      inventoryValue: 750.0,
      isStockout: false,
      isLowStock: true,
      lostSalesUnits: 2,
      lostSalesValue: 300.0,
      leadTimeDays: 5,
      merchantId: 'M-123',
    },
  });

  // Create InventoryAdjustment
  await prisma.inventoryAdjustment.create({
    data: {
      storeId: store.id,
      productId: product.id,
      adjustedBy: 'Alice Smith',
      adjustedAt: new Date(),
      unitsDelta: -1,
      reason: 'Damaged item',
      serialNumber: 'SN-998877',
    },
  });

  console.log('Testing Query 1: Store Current Inventory');
  const inventory = await getStoreCurrentInventory(prisma, store.id);
  console.log(JSON.stringify(inventory, null, 2));

  console.log('Testing Query 2: Low Stock Across Region');
  const lowStock = await getLowStockAcrossRegion(prisma, 'West');
  console.log(JSON.stringify(lowStock, null, 2));

  console.log('Testing Query 3: Product Adjustment History');
  const adjustments = await getProductAdjustmentHistory(
    prisma,
    store.id,
    product.id
  );
  console.log(JSON.stringify(adjustments, null, 2));

  console.log('Testing Query 4: Regional Summary');
  const summary = await getRegionalSummary(prisma, 'West', snapshotDate);
  console.log(JSON.stringify(summary, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
