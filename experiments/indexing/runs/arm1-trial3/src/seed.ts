import { prisma } from "./client.js";

const DAY_1 = new Date("2026-07-31T00:00:00.000Z");
const DAY_2 = new Date("2026-08-01T00:00:00.000Z");

async function main() {
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.store.deleteMany();

  const type = await prisma.productType.create({
    data: { name: "Beverages" },
  });
  const family = await prisma.productFamily.create({
    data: { name: "Still Wine", productTypeId: type.id },
  });
  const line = await prisma.productLine.create({
    data: { name: "Estate Reds", productFamilyId: family.id },
  });
  const brand = await prisma.brand.create({
    data: { brandName: "Blue Ridge Cellars" },
  });

  const products = await Promise.all(
    [
      { skuNumber: "SKU-1001", productName: "Cabernet Sauvignon 750ml" },
      { skuNumber: "SKU-1002", productName: "Merlot 750ml" },
    ].map((product) =>
      prisma.product.create({
        data: { ...product, productLineId: line.id, brandId: brand.id },
      }),
    ),
  );

  const stores = await Promise.all(
    [
      {
        storeKey: "CVL-01",
        name: "Charlottesville Downtown",
        region: "Mid-Atlantic",
        state: "VA",
        city: "Charlottesville",
        zipCode: "22902",
        latitude: 38.0293,
        longitude: -78.4767,
        tier: "A",
      },
      {
        storeKey: "RIC-04",
        name: "Richmond Fan District",
        region: "Mid-Atlantic",
        state: "VA",
        city: "Richmond",
        zipCode: "23220",
        latitude: 37.5538,
        longitude: -77.4603,
        tier: "B",
      },
      {
        storeKey: "AUS-02",
        name: "Austin South Congress",
        region: "Southwest",
        state: "TX",
        city: "Austin",
        zipCode: "78704",
        latitude: 30.2504,
        longitude: -97.7497,
        tier: "A",
      },
    ].map((store) => prisma.store.create({ data: store })),
  );

  let counter = 0;
  for (const snapshotDate of [DAY_1, DAY_2]) {
    for (const store of stores) {
      for (const product of products) {
        counter += 1;
        // Every third row lands under the reorder point, so each snapshot date
        // carries a mix of low-stock and healthy rows.
        const unitsOnHand = counter % 3 === 0 ? 12 : 80 + counter * 5;
        const costPerUnit = 12.5 + counter;
        await prisma.inventoryDaily.create({
          data: {
            snapshotDate,
            storeId: store.id,
            productId: product.id,
            costPerUnit,
            unitsOnHand,
            unitsOnOrder: 24,
            unitsInTransit: 6,
            unitsReceived: 12,
            unitsShrunk: 1,
            reorderPoint: 40,
            maxStockLevel: 200,
            daysOfSupply: unitsOnHand / 4,
            inventoryValue: unitsOnHand * costPerUnit,
            isStockout: unitsOnHand === 0,
            isLowStock: unitsOnHand < 40,
            lostSalesUnits: 2,
            lostSalesValue: 2 * costPerUnit,
            leadTimeDays: 7,
            merchantId: `MERCH-${store.tier}`,
          },
        });
      }
    }
  }

  await prisma.inventoryAdjustment.createMany({
    data: [
      {
        storeId: stores[0].id,
        productId: products[0].id,
        adjustedBy: "r.mercer",
        adjustedAt: new Date("2026-07-30T14:12:00.000Z"),
        unitsDelta: -3,
        reason: "Damaged in transit",
        serialNumber: "ADJ-000001",
      },
      {
        storeId: stores[0].id,
        productId: products[0].id,
        adjustedBy: "t.okafor",
        adjustedAt: new Date("2026-08-01T09:40:00.000Z"),
        unitsDelta: 5,
        reason: "Cycle count correction",
        serialNumber: "ADJ-000002",
      },
      {
        storeId: stores[1].id,
        productId: products[1].id,
        adjustedBy: "r.mercer",
        adjustedAt: new Date("2026-08-01T11:05:00.000Z"),
        unitsDelta: -1,
        reason: "Breakage",
        serialNumber: "ADJ-000003",
      },
    ],
  });

  console.log("Seeded stores, products and inventory snapshots.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
