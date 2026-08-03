import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  SHAPE,
  productsForStore,
  rng,
  rows,
  snapshotDate,
  toCsv,
} from "./generateFacts.ts";

describe("generateFacts", () => {
  it("produces exactly the original's row count", () => {
    expect([...rows()]).toHaveLength(SHAPE.rows);
    expect(SHAPE.dates * SHAPE.stores * SHAPE.productsPerStore).toBe(94_500);
  });

  it("gives every store exactly 150 products", () => {
    for (let s = 0; s < SHAPE.stores; s++) {
      expect(productsForStore(s)).toHaveLength(SHAPE.productsPerStore);
    }
  });

  it("overlaps the stores so the union is exactly 423 distinct products", () => {
    const union = new Set<number>();
    for (let s = 0; s < SHAPE.stores; s++) {
      for (const p of productsForStore(s)) union.add(p);
    }
    expect(union.size).toBe(SHAPE.distinctProducts);
  });

  it("carries the same 19 columns", () => {
    expect(COLUMNS).toHaveLength(19);
    expect(COLUMNS[0]).toBe("snapshot_date");
    expect(COLUMNS[1]).toBe("store_id");
    expect(COLUMNS[2]).toBe("snapshot_date" === COLUMNS[0] ? "product_id" : "");
  });

  it("starts on the original's first snapshot date and steps weekly", () => {
    expect(snapshotDate(0)).toBe("2022-07-24 00:00:00");
    expect(snapshotDate(1)).toBe("2022-07-31 00:00:00");
  });

  it("is deterministic — same seed, same bytes", () => {
    expect(toCsv()).toBe(toCsv());
  });

  it("emits a stable sequence from a given seed", () => {
    const a = rng(42);
    const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("puts exactly 450 rows on each snapshot date", () => {
    const counts = new Map<string, number>();
    for (const r of rows()) {
      const d = String(r[0]);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    expect(counts.size).toBe(SHAPE.dates);
    expect(new Set(counts.values())).toEqual(new Set([450]));
  });
});
