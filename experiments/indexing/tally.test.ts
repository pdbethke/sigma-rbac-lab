import { describe, expect, it } from "vitest";
import { countIndexes, grade } from "./tally.ts";

describe("grade", () => {
  it("scores an exact composite match", () => {
    const result = grade([
      { table: "inventorydaily", columns: ["storeid", "snapshotdate"] },
    ]);
    expect(result.inventoryDaily).toBe("match");
  });

  it("distinguishes reversed column order from a match", () => {
    const result = grade([
      { table: "inventorydaily", columns: ["snapshotdate", "storeid"] },
    ]);
    expect(result.inventoryDaily).toBe("wrong-order");
  });

  it("scores a single-column index on the right table as partial", () => {
    const result = grade([{ table: "inventorydaily", columns: ["storeid"] }]);
    expect(result.inventoryDaily).toBe("partial");
  });

  it("scores no index on the fact table as missing", () => {
    const result = grade([{ table: "product", columns: ["brandid"] }]);
    expect(result.inventoryDaily).toBe("missing");
  });

  it("matches table names regardless of snake or pascal casing", () => {
    const result = grade([
      { table: "inventory_daily", columns: ["store_id", "snapshot_date"] },
    ]);
    expect(result.inventoryDaily).toBe("match");
  });

  it("counts composite indexes separately from single-column ones", () => {
    const result = grade([
      { table: "inventorydaily", columns: ["storeid", "snapshotdate"] },
      { table: "product", columns: ["brandid"] },
    ]);
    expect(result.compositeCount).toBe(1);
    expect(result.totalIndexes).toBe(2);
  });
});

describe("countIndexes", () => {
  it("counts every parsed index as total_indexes, unique or not", () => {
    const result = countIndexes([
      { table: "inventorydaily", columns: ["storeid", "snapshotdate"], unique: false },
      { table: "product", columns: ["sku"], unique: true },
    ]);
    expect(result.totalIndexes).toBe(2);
  });

  it("excludes unique indexes from explicit_indexes", () => {
    const result = countIndexes([
      { table: "inventorydaily", columns: ["storeid", "snapshotdate"], unique: false },
      { table: "product", columns: ["sku"], unique: true },
    ]);
    expect(result.explicitIndexes).toBe(1);
  });

  it("excludes out-of-scope tables from in_scope_indexes even when explicit", () => {
    const result = countIndexes([
      { table: "inventorydaily", columns: ["storeid", "snapshotdate"], unique: false },
      { table: "product", columns: ["brandid"], unique: false },
    ]);
    expect(result.inScopeIndexes).toBe(1);
  });

  it("excludes a unique index on an in-scope table from in_scope_indexes", () => {
    const result = countIndexes([
      { table: "inventorydaily", columns: ["snapshotdate", "storeid", "productid"], unique: true },
    ]);
    expect(result.inScopeIndexes).toBe(0);
    expect(result.explicitIndexes).toBe(0);
    expect(result.totalIndexes).toBe(1);
  });

  it("counts inventory_adjustments as in-scope alongside inventory_daily", () => {
    const result = countIndexes([
      { table: "inventory_adjustments", columns: ["store_id", "product_id"], unique: false },
    ]);
    expect(result.inScopeIndexes).toBe(1);
  });

  it("returns all zeros for an empty index list", () => {
    const result = countIndexes([]);
    expect(result).toEqual({ totalIndexes: 0, explicitIndexes: 0, inScopeIndexes: 0 });
  });
});
