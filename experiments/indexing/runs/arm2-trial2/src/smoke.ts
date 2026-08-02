/**
 * Runs each page function against the seeded database, then asks SQLite for the
 * query plan of each hot statement and asserts it is using an index rather than
 * scanning InventoryDaily. The second half is the part that matters at
 * production scale — the first half only proves the shapes are right.
 */
import { prisma } from "./client.js";
import {
  getStoreCurrentInventory,
  getRegionLowStock,
  getProductAdjustmentHistoryAtStore,
  getRegionalInventoryValueSummary,
} from "./queries.js";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function plan(sql: string, params: unknown[] = []): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ detail: string }[]>(
    `EXPLAIN QUERY PLAN ${sql}`,
    ...params,
  );
  return rows.map((r) => r.detail).join(" | ");
}

async function main() {
  const store = await prisma.store.findFirstOrThrow({ orderBy: { id: "asc" } });
  const product = await prisma.product.findFirstOrThrow({ orderBy: { id: "asc" } });

  // ---- 1. store's current inventory ----
  const inv = await getStoreCurrentInventory(store.id, { take: 5 });
  check("q1 returns rows on the latest date", inv.rows.length > 0, `${inv.rows.length} rows`);
  check(
    "q1 latest date is the newest in the table",
    inv.snapshotDate?.toISOString().slice(0, 10) ===
      (
        await prisma.inventoryDaily.findFirstOrThrow({
          where: { storeId: store.id },
          orderBy: { snapshotDate: "desc" },
        })
      ).snapshotDate
        .toISOString()
        .slice(0, 10),
    String(inv.snapshotDate?.toISOString().slice(0, 10)),
  );
  const r1 = inv.rows[0]!;
  check(
    "q1 carries product, brand and family names",
    Boolean(r1.productName && r1.brandName && r1.productFamilyName),
    `${r1.productName} / ${r1.brandName} / ${r1.productFamilyName} / ${r1.unitsOnHand}`,
  );

  // ---- 2. low stock across a region ----
  const low = await getRegionLowStock("Northeast", { take: 500 });
  check("q2 returns low-stock rows", low.rows.length > 0, `${low.rows.length} rows`);
  check(
    "q2 rows are all genuinely low stock",
    low.rows.every((r) => r.unitsOnHand > 0 && r.unitsOnHand < 25),
  );
  check(
    "q2 spans more than one store in the region",
    new Set(low.rows.map((r) => r.storeName)).size > 1,
    [...new Set(low.rows.map((r) => r.storeName))].join(", "),
  );
  check("q2 on an unknown region is empty, not an error", (await getRegionLowStock("Atlantis")).rows.length === 0);

  // ---- 3. adjustment history ----
  const hist = await getProductAdjustmentHistoryAtStore(store.id, product.id, { take: 10 });
  check("q3 returns history with the actor", hist.length > 0 && Boolean(hist[0]!.adjustedBy), `${hist.length} rows, first by ${hist[0]?.adjustedBy}`);
  check(
    "q3 is ordered newest first",
    hist.every((h, i) => i === 0 || hist[i - 1]!.adjustedAt >= h.adjustedAt),
  );

  // ---- 4. regional summary ----
  const summary = await getRegionalInventoryValueSummary("Northeast", inv.snapshotDate!);
  check("q4 returns one row per store in the region", summary.length === 2, `${summary.length} stores`);
  check(
    "q4 totals are positive",
    summary.every((s) => s.totalInventoryValue.greaterThan(0)),
    summary.map((s) => `${s.storeKey}=${s.totalInventoryValue.toString()}`).join(" "),
  );
  // Cross-check store 1's total against a summation done in JS.
  const manual = await prisma.inventoryDaily.findMany({
    where: { storeId: store.id, snapshotDate: inv.snapshotDate! },
    select: { inventoryValue: true },
  });
  const manualTotal = manual.reduce((a, r) => a.plus(r.inventoryValue), summary[0]!.totalInventoryValue.mul(0));
  check(
    "q4 database aggregate matches a JS summation",
    summary.find((s) => s.storeId === store.id)!.totalInventoryValue.equals(manualTotal),
    manualTotal.toString(),
  );

  // ---- query plans ----
  console.log("\n-- query plans --");
  const p1 = await plan(
    `SELECT id FROM InventoryDaily WHERE storeId = ? ORDER BY snapshotDate DESC LIMIT 1`,
    [store.id],
  );
  console.log(`q1 latest-date : ${p1}`);
  check("q1 latest-date uses an index, no sort", p1.match(/USING (COVERING )?INDEX/) !== null && !p1.includes("TEMP B-TREE"));

  const p1b = await plan(
    `SELECT unitsOnHand FROM InventoryDaily WHERE storeId = ? AND snapshotDate = ?`,
    [store.id, inv.snapshotDate!.getTime()],
  );
  console.log(`q1 page rows   : ${p1b}`);
  check("q1 page rows use an index", p1b.match(/USING (COVERING )?INDEX/) !== null && !p1b.includes("SCAN InventoryDaily"));

  const p2 = await plan(
    `SELECT unitsOnHand FROM InventoryDaily WHERE storeId IN (?, ?) AND snapshotDate = ? AND isLowStock = 1`,
    [1, 2, inv.snapshotDate!.getTime()],
  );
  console.log(`q2 low stock   : ${p2}`);
  check("q2 uses the (storeId, snapshotDate, isLowStock) index", p2.match(/USING (COVERING )?INDEX/) !== null && !p2.includes("SCAN InventoryDaily"));

  const p3 = await plan(
    `SELECT id FROM InventoryAdjustment WHERE storeId = ? AND productId = ? ORDER BY adjustedAt DESC`,
    [store.id, product.id],
  );
  console.log(`q3 history     : ${p3}`);
  check("q3 uses an index and needs no sort step", p3.match(/USING (COVERING )?INDEX/) !== null && !p3.includes("TEMP B-TREE"));

  const p4 = await plan(
    `SELECT storeId, SUM(inventoryValue) FROM InventoryDaily WHERE snapshotDate = ? AND storeId IN (?, ?) GROUP BY storeId`,
    [inv.snapshotDate!.getTime(), 1, 2],
  );
  console.log(`q4 summary     : ${p4}`);
  check("q4 uses an index, no full scan of InventoryDaily", p4.match(/USING (COVERING )?INDEX/) !== null && !p4.includes("SCAN InventoryDaily"));

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
