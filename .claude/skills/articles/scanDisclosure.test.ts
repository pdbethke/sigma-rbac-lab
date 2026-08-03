// publication-guard: ignore-file
// Every credential and address below is a fabricated fixture. This marker is the
// scanner's own escape hatch, applied to itself -- see scanDisclosure.ts.
import { describe, expect, it } from "vitest";
import { scanText, type Finding } from "./scanDisclosure.ts";

const rules = (s: string): string[] => scanText(s).map((f) => f.rule).sort();
const sev = (s: string): string[] => scanText(s).map((f) => f.severity);

describe("credentials — always block", () => {
  it("flags an OpenAI-style key", () => {
    expect(rules("const k = 'sk-abcdefghijklmnopqrstuvwxyz123456'")).toContain("credential");
  });

  it("flags a GitHub token", () => {
    expect(rules("ghp_abcdefghijklmnopqrstuvwxyz1234567890")).toContain("credential");
  });

  it("flags a private key header", () => {
    expect(rules("-----BEGIN RSA PRIVATE KEY-----")).toContain("credential");
  });

  it("blocks rather than merely reviewing", () => {
    expect(sev("AKIAIOSFODNN7EXAMPLE1")).toEqual(["block"]);
  });
});

describe("email addresses", () => {
  it("flags a real-looking address", () => {
    expect(rules("contact me at someone@gmail.com")).toContain("email");
  });

  it("allows example.com, which is what sample data should use", () => {
    expect(scanText("aaliyah.kowalski@example.com")).toEqual([]);
  });

  it("allows an explicitly allowlisted platform constant", () => {
    expect(scanText("sigma.public+viewer0000000000@sigmacomputing.com")).toEqual([]);
  });

  it("allows the commit trailer address", () => {
    expect(scanText("Co-Authored-By: Claude <noreply@anthropic.com>")).toEqual([]);
  });
});

describe("network identifiers", () => {
  it("flags a public IP", () => {
    expect(rules("connect to 203.0.113.9")).toContain("ip-address");
  });

  it("ignores loopback and private ranges", () => {
    expect(scanText("127.0.0.1 10.1.2.3 192.168.0.5 172.16.4.4 0.0.0.0")).toEqual([]);
  });

  it("ignores version-like dotted numbers", () => {
    expect(scanText("prisma 6.19.3 and node 22.23.0")).toEqual([]);
  });
});

describe("infrastructure nouns — review, never block", () => {
  it("surfaces a hosting provider for a human to judge", () => {
    const found = scanText("deployed to Hetzner last week");
    expect(found.map((f) => f.rule)).toContain("infrastructure");
    expect(found[0].severity).toBe("review");
  });

  it("does NOT flag a generic component on its own", () => {
    // ClamAV in an upload pipeline is a normal thing to describe. The exposure
    // was never the component; it was the component named beside a host and a
    // weakness. A scanner cannot judge that, so it must not pretend to.
    expect(scanText("the upload pipeline scans with ClamAV")).toEqual([]);
  });

  it("escalates when a provider and a stated weakness appear on the same line", () => {
    const found = scanText("scp'd to Hetzner without version control");
    expect(found.some((f) => f.rule === "infrastructure-with-weakness")).toBe(true);
    expect(found.find((f) => f.rule === "infrastructure-with-weakness")?.severity).toBe("block");
  });
});

describe("local paths", () => {
  it("reviews an absolute home path", () => {
    expect(rules("/home/alice/PycharmProjects/thing")).toContain("home-path");
  });

  it("ignores a relative path", () => {
    expect(scanText("./experiments/indexing/tally.ts")).toEqual([]);
  });
});

describe("reporting", () => {
  it("reports file and 1-indexed line", () => {
    const found: Finding[] = scanText("ok\nghp_abcdefghijklmnopqrstuvwxyz1234567890", "notes.md");
    expect(found[0].file).toBe("notes.md");
    expect(found[0].line).toBe(2);
  });

  it("redacts the matched secret in its own output", () => {
    const found = scanText("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(found[0].match).not.toContain("uvwxyz123456");
    expect(found[0].match).toContain("…");
  });

  it("finds nothing in clean text", () => {
    expect(scanText("A claim about how the data will be read.")).toEqual([]);
  });
});

describe("suppression", () => {
  it("skips a whole file marked ignore-file", () => {
    const src = "// publication-guard: ignore-file\nsk-abcdefghijklmnopqrstuvwxyz123456";
    expect(scanText(src)).toEqual([]);
  });

  it("skips a single line marked ignore", () => {
    const src = "ghp_abcdefghijklmnopqrstuvwxyz1234567890 // publication-guard: ignore";
    expect(scanText(src)).toEqual([]);
  });

  it("does not skip neighbouring lines", () => {
    const src = "ok // publication-guard: ignore\nsomeone@gmail.com";
    expect(scanText(src).map((f) => f.rule)).toEqual(["email"]);
  });
});
