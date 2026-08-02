import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// A small but structurally complete dataset: two snapshot dates so "latest"
// logic is exercised, two regions, the full product hierarchy, and a couple of
// adjustments. Enough to demonstrate every query returns the right shape.

const DAY_1 = new Date('2026-07-31T00:00:00Z');
const DAY_2 = new Date('2026-08-01T00:00:00Z'); // the latest snapshot

async function main() {
  // Clear (idempotent re-seed).
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.store.deleteMany();

  const east = await prisma.store.create({
    data: {
      storeKey: 'S-001', name: 'Downtown East', region: 'East', state: 'NY',
      city: 'New York', zipCode: '10001', latitude: 40.7506, longitude: -73.9971,
      tier: 'flagship',
    },
  });
  const east2 = await prisma.store.create({
    data: {
      storeKey: 'S-002', name: 'Harborside', region: 'East', state: 'MA',
      city: 'Boston', zipCode: '02110', latitude: 42.3554, longitude: -71.0509,
      tier: 'standard',
    },
  });
  const west = await prisma.store.create({
    data: {
      storeKey: 'S-003', name: 'Bayview', region: 'West', state: 'CA',
      city: 'San Francisco', zipCode: '94105', latitude: 37.7898, longitude: -122.3942,
      tier: 'standard',
    },
  });

  const type = await prisma.productType.create({ data: { name: 'Beverages' } });
  const family = await prisma.productFamily.create({
    data: { name: 'Coffee', productTypeId: type.id },
  });
  const line = await prisma.productLine.create({
    data: { name: 'Cold Brew', productFamilyId: family.id },
  });

  const acme = await prisma.brand.create({ data: { name: 'Acme' } });
  const zenith = await prisma.brand.create({ data: { name: 'Zenith' } });

  const p1 = await prisma.product.create({
    data: { sku: 'SKU-1001', name: 'Cold Brew 12oz', productLineId: line.id, brandId: acme.id },
  });
  const p2 = await prisma.product.create({
    data: { sku: 'SKU-1002', name: 'Cold Brew 32oz', productLineId: line.id, brandId: zenith.id },
  });

  const dec = (n: string) => new Prisma.Decimal(n);

  // Helper to build an InventoryDaily row with sensible defaults.
  const snap = (
    snapshotDate: Date, storeId: number, productId: number,
    unitsOnHand: number, isLowStock: boolean, inventoryValue: string,
  ): Prisma.InventoryDailyCreateManyInput => ({
    snapshotDate, storeId, productId,
    costPerUnit: dec('3.50'), unitsOnHand, unitsOnOrder: 20, unitsInTransit: 5,
    unitsReceived: 10, unitsShrunk: 1, reorderPoint: 15, maxStockLevel: 200,
    daysOfSupply: 12, inventoryValue: dec(inventoryValue),
    isStockout: unitsOnHand === 0, isLowStock, lostSalesUnits: 0,
    lostSalesValue: dec('0'), leadTimeDays: 7, merchantId: 42,
  });

  await prisma.inventoryDaily.createMany({
    data: [
      // Day 1
      snap(DAY_1, east.id, p1.id, 120, false, '420.00'),
      snap(DAY_1, east.id, p2.id, 60, false, '210.00'),
      snap(DAY_1, west.id, p1.id, 80, false, '280.00'),
      // Day 2 (latest)
      snap(DAY_2, east.id, p1.id, 100, false, '350.00'),
      snap(DAY_2, east.id, p2.id, 8, true, '28.00'),   // low stock, East
      snap(DAY_2, east2.id, p1.id, 5, true, '17.50'),  // low stock, East
      snap(DAY_2, west.id, p1.id, 70, false, '245.00'),
      snap(DAY_2, west.id, p2.id, 3, true, '10.50'),   // low stock, West
    ],
  });

  await prisma.inventoryAdjustment.createMany({
    data: [
      {
        storeId: east.id, productId: p1.id, adjustedBy: 'a.rivera',
        adjustedAt: new Date('2026-07-30T14:00:00Z'), unitsDelta: -4,
        reason: 'damage', serialNumber: 'ADJ-0001',
      },
      {
        storeId: east.id, productId: p1.id, adjustedBy: 'j.okoro',
        adjustedAt: new Date('2026-08-01T09:30:00Z'), unitsDelta: 12,
        reason: 'recount', serialNumber: 'ADJ-0002',
      },
    ],
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
