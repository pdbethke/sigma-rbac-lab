import { describe, expect, it } from "vitest";
import { grade } from "./tally.ts";

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
