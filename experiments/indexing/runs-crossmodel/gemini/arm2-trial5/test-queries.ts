import { prisma, getStoreCurrentInventory, getLowStockAcrossRegion, getProductAdjustmentHistory, getRegionalSummary } from './src/queries';

async function runTests() {
  console.log('--- Cleaning DB ---');
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.store.deleteMany();

  console.log('--- Seeding DB ---');
  const store1 = await prisma.store.create({
    data: {
      storeKey: 'STORE-101',
      name: 'Downtown Store',
      region: 'North',
      state: 'NY',
      city: 'New York',
      zipCode: '10001',
      latitude: 40.7128,
      longitude: -74.006,
      tier: 'Flagship',
    },
  });

  const store2 = await prisma.store.create({
    data: {
      storeKey: 'STORE-102',
      name: 'Uptown Store',
      region: 'North',
      state: 'NY',
      city: 'New York',
      zipCode: '10021',
      latitude: 40.7736,
      longitude: -73.9566,
      tier: 'Standard',
    },
  });

  const pType = await prisma.productType.create({
    data: { name: 'Electronics' },
  });

  const pFamily = await prisma.productFamily.create({
    data: { name: 'Computers', productTypeId: pType.id },
  });

  const pLine = await prisma.productLine.create({
    data: { name: 'Laptops', productFamilyId: pFamily.id },
  });

  const brand = await prisma.brand.create({
    data: { name: 'TechCo' },
  });

  const product1 = await prisma.product.create({
    data: {
      sku: 'SKU-001',
      name: 'Pro Laptop 15"',
      productLineId: pLine.id,
      brandId: brand.id,
    },
  });

  const product2 = await prisma.product.create({
    data: {
      sku: 'SKU-002',
      name: 'Air Laptop 13"',
      productLineId: pLine.id,
      brandId: brand.id,
    },
  });

  const snapshotDate1 = new Date('2026-08-01T00:00:00Z');
  const snapshotDate2 = new Date('2026-08-02T00:00:00Z');

  // Inventory Daily for Store 1
  await prisma.inventoryDaily.createMany({
    data: [
      {
        snapshotDate: snapshotDate1,
        storeId: store1.id,
        productId: product1.id,
        costPerUnit: 800,
        unitsOnHand: 10,
        unitsOnOrder: 5,
        unitsInTransit: 0,
        unitsReceived: 0,
        unitsShrunk: 0,
        reorderPoint: 5,
        maxStockLevel: 20,
        daysOfSupply: 10,
        inventoryValue: 8000,
        isStockout: false,
        isLowStock: false,
        lostSalesUnits: 0,
        lostSalesValue: 0,
        leadTimeDays: 3,
        merchantId: 'MCH-1',
      },
      {
        snapshotDate: snapshotDate2,
        storeId: store1.id,
        productId: product1.id,
        costPerUnit: 800,
        unitsOnHand: 2,
        unitsOnOrder: 10,
        unitsInTransit: 5,
        unitsReceived: 0,
        unitsShrunk: 1,
        reorderPoint: 5,
        maxStockLevel: 20,
        daysOfSupply: 2,
        inventoryValue: 1600,
        isStockout: false,
        isLowStock: true,
        lostSalesUnits: 1,
        lostSalesValue: 800,
        leadTimeDays: 3,
        merchantId: 'MCH-1',
      },
      {
        snapshotDate: snapshotDate2,
        storeId: store1.id,
        productId: product2.id,
        costPerUnit: 500,
        unitsOnHand: 15,
        unitsOnOrder: 0,
        unitsInTransit: 0,
        unitsReceived: 5,
        unitsShrunk: 0,
        reorderPoint: 3,
        maxStockLevel: 15,
        daysOfSupply: 15,
        inventoryValue: 7500,
        isStockout: false,
        isLowStock: false,
        lostSalesUnits: 0,
        lostSalesValue: 0,
        leadTimeDays: 2,
        merchantId: 'MCH-1',
      },
      // Inventory Daily for Store 2
      {
        snapshotDate: snapshotDate2,
        storeId: store2.id,
        productId: product1.id,
        costPerUnit: 800,
        unitsOnHand: 1,
        unitsOnOrder: 10,
        unitsInTransit: 0,
        unitsReceived: 0,
        unitsShrunk: 0,
        reorderPoint: 5,
        maxStockLevel: 20,
        daysOfSupply: 1,
        inventoryValue: 800,
        isStockout: false,
        isLowStock: true,
        lostSalesUnits: 2,
        lostSalesValue: 1600,
        leadTimeDays: 3,
        merchantId: 'MCH-1',
      },
    ],
  });

  // Adjustments
  await prisma.inventoryAdjustment.createMany({
    data: [
      {
        storeId: store1.id,
        productId: product1.id,
        adjustedBy: 'Alice (Manager)',
        adjustedAt: new Date('2026-08-01T10:00:00Z'),
        unitsDelta: -1,
        reason: 'Damaged item',
        serialNumber: 'SN-12345',
      },
      {
        storeId: store1.id,
        productId: product1.id,
        adjustedBy: 'Bob (Inventory Lead)',
        adjustedAt: new Date('2026-08-02T14:30:00Z'),
        unitsDelta: 5,
        reason: 'Correction',
        serialNumber: 'SN-12346',
      },
    ],
  });

  console.log('--- Testing Query 1: Store Current Inventory ---');
  const store1CurrentInv = await getStoreCurrentInventory(store1.id);
  console.log(JSON.stringify(store1CurrentInv, null, 2));

  if (store1CurrentInv.length !== 2) throw new Error('Query 1 returned unexpected count');
  if (store1CurrentInv[0].productFamilyName !== 'Computers') throw new Error('Query 1 missing productFamilyName');

  console.log('--- Testing Query 2: Low Stock Across Region ---');
  const lowStockNorth = await getLowStockAcrossRegion('North');
  console.log(JSON.stringify(lowStockNorth, null, 2));

  if (lowStockNorth.length !== 2) throw new Error('Query 2 returned unexpected count');

  console.log('--- Testing Query 3: Product Adjustment History ---');
  const adjHistory = await getProductAdjustmentHistory(store1.id, product1.id);
  console.log(JSON.stringify(adjHistory, null, 2));

  if (adjHistory.length !== 2) throw new Error('Query 3 returned unexpected count');
  if (adjHistory[0].adjustedBy !== 'Bob (Inventory Lead)') throw new Error('Query 3 order or adjustedBy mismatch');

  console.log('--- Testing Query 4: Regional Summary ---');
  const regionalSummary = await getRegionalSummary('North', '2026-08-02');
  console.log(JSON.stringify(regionalSummary, null, 2));

  if (regionalSummary.length !== 2) throw new Error('Query 4 returned unexpected store count');

  console.log('--- All tests passed successfully! ---');
}

runTests()
  .catch((e) => {
    console.error('Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
