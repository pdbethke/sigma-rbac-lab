import { describe, expect, it } from "vitest";
import { countRows, meanWithN, verdictRows } from "./shapeData.ts";

const TRIALS = [
  { run: "arm1-trial1", arm: 1, trial: 1, gradeable: true, total_indexes: 2,
    composite_count: 1, inventory_daily: "match", adjustments: "missing" },
  { run: "arm2-trial1", arm: 2, trial: 1, gradeable: false, total_indexes: 0,
    composite_count: 0, inventory_daily: "missing", adjustments: "missing" },
];

describe("verdictRows", () => {
  it("emits one row per trial per target index", () => {
    expect(verdictRows(TRIALS)).toHaveLength(4);
  });

  it("maps wrong-order to the warning status, not to serious", () => {
    const rows = verdictRows([{ ...TRIALS[0], inventory_daily: "wrong-order" }]);
    expect(rows.find((r) => r.target === "inventory_daily")?.status).toBe("warning");
  });

  it("gives every row a text label so colour is never the only channel", () => {
    for (const row of verdictRows(TRIALS)) {
      expect(row.label.length).toBeGreaterThan(0);
    }
  });

  it("marks ungradeable trials rather than dropping them", () => {
    const rows = verdictRows(TRIALS).filter((r) => r.run === "arm2-trial1");
    expect(rows.every((r) => r.gradeable === false)).toBe(true);
  });
});

describe("countRows", () => {
  it("keeps every trial, including ungradeable ones", () => {
    expect(countRows(TRIALS)).toHaveLength(2);
  });

  it("computes no percentages", () => {
    const serialized = JSON.stringify(countRows(TRIALS));
    expect(serialized).not.toMatch(/percent|pct|rate/i);
  });
});

describe("meanWithN", () => {
  it("excludes ungradeable trials from the mean and reports n", () => {
    const rows = countRows([
      { ...TRIALS[0], explicit_indexes: 10, in_scope_indexes: 5 },
      { ...TRIALS[1], explicit_indexes: 0, in_scope_indexes: 0 },
    ]);
    const result = meanWithN(rows, "explicit_indexes");
    expect(result.n).toBe(1);
    expect(result.mean).toBe(10);
  });

  it("never appears alongside a percent/pct/rate key", () => {
    const rows = countRows(TRIALS);
    const result = meanWithN(rows, "total_indexes");
    expect(JSON.stringify(result)).not.toMatch(/percent|pct|rate/i);
  });
});
