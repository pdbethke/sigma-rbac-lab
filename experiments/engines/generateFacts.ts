/**
 * Deterministic generator for the engine comparison's fact table.
 *
 * WHY THIS EXISTS. The engine demonstration (SQLite naming its index, DuckDB
 * ignoring the equivalent one) originally ran against a fact table derived from a
 * vendor's sample dataset. A query plan depends on row count, cardinality and
 * distribution — not on values — so the demonstration does not need borrowed
 * rows, and a standalone public repository should not carry them.
 *
 * FIDELITY. Reproduces the original's shape exactly, because the plan depends on it:
 *
 *     94,500 rows = 210 snapshot dates x 3 stores x 150 products per store
 *     423 distinct products, since the three stores' 150-product sets overlap by 27
 *     19 columns, the same names and types as the original
 *     dates weekly from 2022-07-24, the original's first and last snapshot
 *
 * Same seed in, same bytes out. No randomness that varies per run.
 */

export interface FactShape {
  dates: number;
  stores: number;
  productsPerStore: number;
  distinctProducts: number;
  rows: number;
}

export const SHAPE: FactShape = {
  dates: 210,
  stores: 3,
  productsPerStore: 150,
  distinctProducts: 423,
  rows: 94_500,
};

export const COLUMNS = [
  "snapshot_date", "store_id", "product_id", "cost_per_unit", "units_on_hand",
  "units_on_order", "units_in_transit", "units_received", "units_shrunk",
  "reorder_point", "max_stock_level", "days_of_supply", "inventory_value",
  "is_stockout", "is_low_stock", "lost_sales_units", "lost_sales_value",
  "lead_time_days", "merchant_id",
] as const;

/** mulberry32 — a small deterministic PRNG so the output is byte-stable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable synthetic identifiers — readable, and clearly not anybody's real data. */
export const storeId = (i: number): string => `store-${String(i + 1).padStart(3, "0")}`;
export const productId = (i: number): string => `product-${String(i + 1).padStart(4, "0")}`;

/**
 * Which products each store carries. Windows overlap so the union is exactly
 * `distinctProducts` while each store holds exactly `productsPerStore`:
 * 3 x 150 = 450, minus 27 shared, = 423.
 */
export function productsForStore(store: number): number[] {
  const { productsPerStore, distinctProducts, stores } = SHAPE;
  const span = distinctProducts - productsPerStore;
  const start = stores === 1 ? 0 : Math.round((span * store) / (stores - 1));
  return Array.from({ length: productsPerStore }, (_, k) => start + k);
}

/** Weekly snapshots from the original's first date. */
export function snapshotDate(i: number): string {
  const start = Date.UTC(2022, 6, 24);
  const day = 86_400_000;
  return new Date(start + i * 7 * day).toISOString().slice(0, 10) + " 00:00:00";
}

export function* rows(): Generator<(string | number)[]> {
  const random = rng(20260803);
  for (let d = 0; d < SHAPE.dates; d++) {
    const date = snapshotDate(d);
    for (let s = 0; s < SHAPE.stores; s++) {
      for (const p of productsForStore(s)) {
        const cost = Math.round(random() * 200000) / 100;
        const onHand = Math.floor(random() * 400);
        const reorder = Math.floor(random() * 50);
        yield [
          date, storeId(s), productId(p), cost, onHand,
          Math.floor(random() * 60), Math.floor(random() * 30),
          Math.floor(random() * 40), Math.floor(random() * 5),
          reorder, Math.floor(random() * 500) + 100,
          Math.round(random() * 6000) / 100,
          Math.round(cost * onHand * 100) / 100,
          onHand === 0 ? 1 : 0, onHand < reorder ? 1 : 0,
          Math.floor(random() * 10), Math.round(random() * 50000) / 100,
          Math.floor(random() * 20) + 1,
          `merchant-${String(Math.floor(random() * 8) + 1).padStart(3, "0")}`,
        ];
      }
    }
  }
}

export function toCsv(): string {
  const out: string[] = [COLUMNS.join(",")];
  for (const r of rows()) out.push(r.join(","));
  return out.join("\n") + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { writeFileSync } = await import("node:fs");
  const target = process.argv[2] ?? "experiments/engines/inventory_daily.csv";
  writeFileSync(target, toCsv());
  console.log(`wrote ${target}`);
}
