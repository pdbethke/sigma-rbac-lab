import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_BY_INCREMENT,
  gradeIncrement,
  newIndexes,
  parsePrismaIndexes,
} from "./gradeDrift.ts";

describe("parsePrismaIndexes", () => {
  it("reads the snapshot format the harness writes (line-numbered grep output)", () => {
    const text = [
      "104:  @@unique([snapshotDate, storeId, productId])",
      "122:  @@index([adjustedAt])",
    ].join("\n");
    expect(parsePrismaIndexes(text)).toEqual([
      { kind: "unique", columns: ["snapshotdate", "storeid", "productid"] },
      { kind: "index", columns: ["adjustedat"] },
    ]);
  });

  it("keeps column order, which is the whole point of the grading", () => {
    const text = "1:  @@index([adjustedBy, adjustedAt])";
    expect(parsePrismaIndexes(text)[0].columns).toEqual(["adjustedby", "adjustedat"]);
  });

  it("returns an empty array for an empty snapshot", () => {
    expect(parsePrismaIndexes("")).toEqual([]);
  });
});

describe("newIndexes", () => {
  it("returns only what this increment added", () => {
    const before = parsePrismaIndexes("1:  @@index([adjustedAt])");
    const after = parsePrismaIndexes(
      "1:  @@index([adjustedAt])\n2:  @@index([adjustedBy, adjustedAt])",
    );
    expect(newIndexes(before, after)).toEqual([
      { kind: "index", columns: ["adjustedby", "adjustedat"] },
    ]);
  });

  it("ignores @@unique — the harness snapshots it but it is not a declaration under test", () => {
    const before = parsePrismaIndexes("");
    const after = parsePrismaIndexes("1:  @@unique([snapshotDate, storeId, productId])");
    expect(newIndexes(before, after)).toEqual([]);
  });

  it("returns nothing when the schema did not change", () => {
    const same = parsePrismaIndexes("1:  @@index([adjustedAt])");
    expect(newIndexes(same, same)).toEqual([]);
  });
});

describe("gradeIncrement", () => {
  const expected = { columns: ["adjustedby", "adjustedat"] };

  it("scores an exact match in the right column order as correct", () => {
    const added = [{ kind: "index" as const, columns: ["adjustedby", "adjustedat"] }];
    expect(gradeIncrement(added, expected)).toBe("correct");
  });

  it("scores reversed column order as partial, not correct", () => {
    const added = [{ kind: "index" as const, columns: ["adjustedat", "adjustedby"] }];
    expect(gradeIncrement(added, expected)).toBe("partial");
  });

  it("scores a leading-column-only index as partial", () => {
    const added = [{ kind: "index" as const, columns: ["adjustedby"] }];
    expect(gradeIncrement(added, expected)).toBe("partial");
  });

  it("scores an index on unrelated columns as none", () => {
    const added = [{ kind: "index" as const, columns: ["region"] }];
    expect(gradeIncrement(added, expected)).toBe("none");
  });

  it("scores adding nothing as none", () => {
    expect(gradeIncrement([], expected)).toBe("none");
  });

  it("credits the target even when the session declared a pile of other indexes too", () => {
    const added = [
      { kind: "index" as const, columns: ["region"] },
      { kind: "index" as const, columns: ["adjustedby", "adjustedat"] },
      { kind: "index" as const, columns: ["brandid"] },
    ];
    expect(gradeIncrement(added, expected)).toBe("correct");
  });

  it("accepts a superset that leads with the expected tuple", () => {
    const added = [
      { kind: "index" as const, columns: ["adjustedby", "adjustedat", "storeid"] },
    ];
    expect(gradeIncrement(added, expected)).toBe("partial");
  });
});

describe("EXPECTED_BY_INCREMENT", () => {
  it("has one expectation per increment, in order", () => {
    expect(EXPECTED_BY_INCREMENT.map((e) => e.increment)).toEqual([1, 2, 3, 4]);
  });

  // Guards against the encoded expectations silently drifting from the frozen file.
  it("matches the pre-registered EXPECTED.md verbatim", () => {
    const frozen = readFileSync(new URL("./EXPECTED.md", import.meta.url), "utf8");
    const normalized = frozen.toLowerCase().replace(/\s+/g, "");
    for (const e of EXPECTED_BY_INCREMENT) {
      const declaration = `@@index([${e.columns.join(",")}])`;
      expect(normalized).toContain(declaration);
    }
  });
});
