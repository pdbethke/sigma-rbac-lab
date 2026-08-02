/**
 * Small deterministic seed: 2 regions, 4 stores, 6 products, 5 snapshot days,
 * plus a handful of adjustments. Enough to exercise every query path.
 */

import { prisma } from './queries.js';

const REGIONS = [
  { region: 'Northeast', cities: ['Boston', 'Hartford'], state: 'MA' },
  { region: 'Southwest', cities: ['Phoenix', 'Tucson'], state: 'AZ' },
];

const SNAPSHOT_DAYS = 5;

function day(offsetFromEnd: number): Date {
  // Fixed base date so runs are reproducible.
  const base = Date.UTC(2026, 6, 31);
  return new Date(base - offsetFromEnd * 86_400_000);
}

async function main() {
  // Clear in FK-safe order.
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.store.deleteMany();
  await prisma.user.deleteMany();

  const stores = [];
  for (const r of REGIONS) {
    for (const city of r.cities) {
      stores.push(
        await prisma.store.create({
          data: {
            storeKey: `${r.region.slice(0, 2).toUpperCase()}-${city.slice(0, 3).toUpperCase()}`,
            name: `${city} Store`,
            region: r.region,
            state: r.state,
            city,
            zipCode: '00000',
            latitude: 40 + stores.length,
            longitude: -80 - stores.length,
            tier: stores.length % 2 === 0 ? 'flagship' : 'standard',
          },
        })
      );
    }
  }

  const type = await prisma.productType.create({ data: { name: 'Hardware' } });
  const famA = await prisma.productFamily.create({
    data: { name: 'Power Tools', productTypeId: type.id },
  });
  const famB = await prisma.productFamily.create({
    data: { name: 'Fasteners', productTypeId: type.id },
  });
  const lineA = await prisma.productLine.create({
    data: { name: 'Cordless Drills', productFamilyId: famA.id },
  });
  const lineB = await prisma.productLine.create({
    data: { name: 'Deck Screws', productFamilyId: famB.id },
  });
  const brand1 = await prisma.brand.create({ data: { brandName: 'Ironclad' } });
  const brand2 = await prisma.brand.create({ data: { brandName: 'Northgate' } });

  const products = [];
  for (let i = 0; i < 6; i++) {
    products.push(
      await prisma.product.create({
        data: {
          skuNumber: `SKU-${1000 + i}`,
          productName: i < 3 ? `Drill Model ${i}` : `Screw Pack ${i}`,
          productLineId: i < 3 ? lineA.id : lineB.id,
          brandId: i % 2 === 0 ? brand1.id : brand2.id,
        },
      })
    );
  }

  const users = await Promise.all(
    ['Dana Reyes', 'Sam Okafor'].map((fullName, i) =>
      prisma.user.create({
        data: { fullName, email: `user${i}@chain.example` },
      })
    )
  );

  const snapshots = [];
  for (let d = SNAPSHOT_DAYS - 1; d >= 0; d--) {
    const snapshotDate = day(d);
    for (const store of stores) {
      for (const [pi, product] of products.entries()) {
        const unitsOnHand = 5 + pi * 20 + d;
        const reorderPoint = 30;
        const costPerUnit = 10 + pi;
        snapshots.push({
          snapshotDate,
          storeId: store.id,
          productId: product.id,
          costPerUnit,
          unitsOnHand,
          unitsOnOrder: 4,
          unitsInTransit: 2,
          unitsReceived: 3,
          unitsShrunk: 0,
          reorderPoint,
          maxStockLevel: 200,
          daysOfSupply: unitsOnHand / 4,
          inventoryValue: unitsOnHand * costPerUnit,
          isStockout: unitsOnHand === 0,
          isLowStock: unitsOnHand < reorderPoint,
          lostSalesUnits: 0,
          lostSalesValue: 0,
          leadTimeDays: 7,
          merchantId: `M-${(pi % 3) + 1}`,
        });
      }
    }
  }
  await prisma.inventoryDaily.createMany({ data: snapshots });

  let serial = 0;
  for (const u of users) {
    for (let k = 0; k < 3; k++) {
      await prisma.inventoryAdjustment.create({
        data: {
          storeId: stores[0].id,
          productId: products[0].id,
          adjustedById: u.id,
          adjustedAt: day(k),
          unitsDelta: k % 2 === 0 ? -2 : 5,
          reason: k % 2 === 0 ? 'damage' : 'cycle count',
          serialNumber: `ADJ-${serial++}`,
        },
      });
    }
  }

  console.log(
    `Seeded ${stores.length} stores, ${products.length} products, ${snapshots.length} snapshot rows.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
