/**
 * Small deterministic seed — enough rows to exercise every join and filter in
 * src/queries.ts, not a load test. 4 stores across 2 regions, 12 products,
 * 30 snapshot dates.
 */
import { prisma } from "./client.js";

const REGIONS = [
  { region: "Northeast", state: "NY", stores: ["NE-001", "NE-002"] },
  { region: "Southeast", state: "GA", stores: ["SE-001", "SE-002"] },
];

const TYPES = ["Beverages", "Household"];
const FAMILIES: Record<string, string[]> = {
  Beverages: ["Coffee", "Tea"],
  Household: ["Cleaning", "Paper"],
};
const BRANDS = ["Northwind", "Acme", "Contoso"];

/** Deterministic pseudo-random so reruns produce the same database. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

async function main() {
  const rand = rng(42);

  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventoryDaily.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productLine.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.store.deleteMany();

  const stores = [];
  for (const r of REGIONS) {
    for (const [i, key] of r.stores.entries()) {
      stores.push(
        await prisma.store.create({
          data: {
            storeKey: key,
            name: `${r.region} Store ${i + 1}`,
            region: r.region,
            state: r.state,
            city: `City ${i + 1}`,
            zipCode: `${10000 + stores.length}`,
            latitude: 35 + rand(),
            longitude: -80 + rand(),
            tier: i === 0 ? "Flagship" : "Standard",
          },
        }),
      );
    }
  }

  const brands = [];
  for (const brandName of BRANDS) {
    brands.push(await prisma.brand.create({ data: { brandName } }));
  }

  const lines = [];
  for (const typeName of TYPES) {
    const type = await prisma.productType.create({ data: { name: typeName } });
    for (const familyName of FAMILIES[typeName]!) {
      const family = await prisma.productFamily.create({
        data: { name: familyName, productTypeId: type.id },
      });
      for (const suffix of ["Core", "Premium"]) {
        lines.push(
          await prisma.productLine.create({
            data: { name: `${familyName} ${suffix}`, productFamilyId: family.id },
          }),
        );
      }
    }
  }

  const products = [];
  for (const [i, line] of lines.entries()) {
    for (const n of [1, 2]) {
      products.push(
        await prisma.product.create({
          data: {
            sku: `SKU-${String(i * 2 + n).padStart(5, "0")}`,
            name: `${line.name} Item ${n}`,
            productLineId: line.id,
            brandId: brands[(i + n) % brands.length]!.id,
          },
        }),
      );
    }
  }

  const dates: Date[] = [];
  for (let d = 0; d < 30; d++) {
    dates.push(new Date(Date.UTC(2026, 6, 1 + d)));
  }

  const rows = [];
  for (const snapshotDate of dates) {
    for (const store of stores) {
      for (const product of products) {
        const unitsOnHand = Math.floor(rand() * 120);
        const reorderPoint = 25;
        const costPerUnit = 2 + Math.floor(rand() * 30);
        rows.push({
          snapshotDate,
          storeId: store.id,
          productId: product.id,
          costPerUnit,
          unitsOnHand,
          unitsOnOrder: Math.floor(rand() * 40),
          unitsInTransit: Math.floor(rand() * 20),
          unitsReceived: Math.floor(rand() * 15),
          unitsShrunk: Math.floor(rand() * 3),
          reorderPoint,
          maxStockLevel: 200,
          daysOfSupply: Math.floor(unitsOnHand / 4),
          inventoryValue: unitsOnHand * costPerUnit,
          isStockout: unitsOnHand === 0,
          isLowStock: unitsOnHand > 0 && unitsOnHand < reorderPoint,
          lostSalesUnits: unitsOnHand === 0 ? Math.floor(rand() * 10) : 0,
          lostSalesValue: unitsOnHand === 0 ? Math.floor(rand() * 100) : 0,
          leadTimeDays: 3 + Math.floor(rand() * 7),
          merchantId: 500 + (product.id % 5),
        });
      }
    }
  }
  await prisma.inventoryDaily.createMany({ data: rows });

  const adjustments = [];
  const who = ["a.rivera", "j.chen", "m.okafor"];
  for (let i = 0; i < 200; i++) {
    const store = stores[Math.floor(rand() * stores.length)]!;
    const product = products[Math.floor(rand() * products.length)]!;
    adjustments.push({
      storeId: store.id,
      productId: product.id,
      adjustedBy: who[i % who.length]!,
      adjustedAt: new Date(Date.UTC(2026, 6, 1 + Math.floor(rand() * 30), i % 24)),
      unitsDelta: Math.floor(rand() * 21) - 10,
      reason: ["Cycle count", "Damage", "Theft", "Transfer"][i % 4]!,
      serialNumber: `ADJ-${String(i).padStart(6, "0")}`,
    });
  }
  // Guarantee the smoke test has a store/product pair with history.
  adjustments.push({
    storeId: stores[0]!.id,
    productId: products[0]!.id,
    adjustedBy: "a.rivera",
    adjustedAt: new Date(Date.UTC(2026, 6, 30, 9)),
    unitsDelta: -4,
    reason: "Cycle count",
    serialNumber: "ADJ-SMOKE-1",
  });
  await prisma.inventoryAdjustment.createMany({ data: adjustments });

  console.log(
    `seeded: ${stores.length} stores, ${products.length} products, ` +
      `${rows.length} snapshot rows, ${adjustments.length} adjustments`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
