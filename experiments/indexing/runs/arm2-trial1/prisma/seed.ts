/** Small deterministic seed — enough rows to exercise every query path. */
import { Prisma } from "../src/generated/prisma/client.js";
import { prisma } from "../src/client.js";

const REGIONS = [
  { region: "Northeast", state: "NY", cities: ["Albany", "Buffalo", "Ithaca"] },
  { region: "Southeast", state: "GA", cities: ["Atlanta", "Savannah"] },
  { region: "Midwest", state: "OH", cities: ["Columbus", "Toledo"] },
];

const SNAPSHOT_DAYS = 10;

async function main() {
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.adjuster.deleteMany();
  await prisma.store.deleteMany();

  let storeSeq = 0;
  const stores = [];
  for (const r of REGIONS) {
    for (const city of r.cities) {
      storeSeq += 1;
      stores.push(
        await prisma.store.create({
          data: {
            storeKey: `S${String(storeSeq).padStart(4, "0")}`,
            name: `${city} ${r.region} Store`,
            region: r.region,
            state: r.state,
            city,
            zipCode: `${10000 + storeSeq}`,
            latitude: 35 + storeSeq * 0.5,
            longitude: -80 - storeSeq * 0.5,
            tier: storeSeq % 3 === 0 ? "flagship" : "standard",
          },
        }),
      );
    }
  }

  const type = await prisma.productType.create({ data: { name: "Beverage" } });
  const family = await prisma.productFamily.create({
    data: { name: "Sparkling Water", productTypeId: type.id },
  });
  const family2 = await prisma.productFamily.create({
    data: { name: "Cold Brew", productTypeId: type.id },
  });
  const lines = [
    await prisma.productLine.create({
      data: { name: "Citrus", productFamilyId: family.id },
    }),
    await prisma.productLine.create({
      data: { name: "Berry", productFamilyId: family.id },
    }),
    await prisma.productLine.create({
      data: { name: "Nitro", productFamilyId: family2.id },
    }),
  ];
  const brands = [
    await prisma.brand.create({ data: { name: "Cascade" } }),
    await prisma.brand.create({ data: { name: "Northwind" } }),
  ];

  const products = [];
  for (let i = 0; i < 12; i++) {
    products.push(
      await prisma.product.create({
        data: {
          sku: `SKU-${1000 + i}`,
          name: `Product ${i + 1}`,
          productLineId: lines[i % lines.length].id,
          brandId: brands[i % brands.length].id,
        },
      }),
    );
  }

  const adjusters = [
    await prisma.adjuster.create({
      data: { name: "Dana Reyes", email: "dana@example.com" },
    }),
    await prisma.adjuster.create({
      data: { name: "Sam Okafor", email: "sam@example.com" },
    }),
  ];

  const base = Date.UTC(2026, 6, 1);
  const daily: Prisma.InventoryDailyCreateManyInput[] = [];
  for (let d = 0; d < SNAPSHOT_DAYS; d++) {
    const snapshotDate = new Date(base + d * 86_400_000);
    for (const store of stores) {
      for (const [pi, product] of products.entries()) {
        const unitsOnHand = (store.id * 7 + pi * 13 + d * 3) % 90;
        const reorderPoint = 20;
        daily.push({
          snapshotDate,
          storeId: store.id,
          productId: product.id,
          costPerUnit: new Prisma.Decimal((2 + (pi % 5)).toFixed(2)),
          unitsOnHand,
          unitsOnOrder: (pi * 3) % 20,
          unitsInTransit: (pi * 2) % 11,
          unitsReceived: (d * 4) % 17,
          unitsShrunk: pi % 3,
          reorderPoint,
          maxStockLevel: 200,
          daysOfSupply: Math.max(1, Math.floor(unitsOnHand / 4)),
          inventoryValue: new Prisma.Decimal(
            (unitsOnHand * (2 + (pi % 5))).toFixed(2),
          ),
          isStockout: unitsOnHand === 0,
          isLowStock: unitsOnHand < reorderPoint,
          lostSalesUnits: unitsOnHand === 0 ? 5 : 0,
          lostSalesValue: new Prisma.Decimal(unitsOnHand === 0 ? "12.50" : "0"),
          leadTimeDays: 3 + (pi % 4),
          merchantId: 100 + (pi % 4),
        });
      }
    }
  }
  await prisma.inventoryDaily.createMany({ data: daily });

  const adjustments: Prisma.InventoryAdjustmentCreateManyInput[] = [];
  let serial = 0;
  for (const store of stores.slice(0, 3)) {
    for (const product of products.slice(0, 4)) {
      for (let k = 0; k < 5; k++) {
        serial += 1;
        adjustments.push({
          storeId: store.id,
          productId: product.id,
          adjusterId: adjusters[k % adjusters.length].id,
          adjustedAt: new Date(base + k * 86_400_000 + 3_600_000),
          unitsDelta: k % 2 === 0 ? -(k + 1) : k + 1,
          reason: k % 2 === 0 ? "damage" : "cycle count",
          serialNumber: `ADJ-${String(serial).padStart(6, "0")}`,
        });
      }
    }
  }
  await prisma.inventoryAdjustment.createMany({ data: adjustments });

  console.log(
    `seeded ${stores.length} stores, ${products.length} products, ${daily.length} daily rows, ${adjustments.length} adjustments`,
  );
}

main().finally(() => prisma.$disconnect());
