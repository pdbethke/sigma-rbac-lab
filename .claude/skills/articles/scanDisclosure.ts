/**
 * Pre-publication scanner: things that should not leave a private machine.
 *
 * Self-contained on purpose — node builtins only, no dependencies — so the same
 * file can sit in a repository and in ~/.claude/skills/ and behave identically.
 *
 *     node --experimental-strip-types scanDisclosure.ts [path]
 *
 * Exit code is 1 if anything is `block`, 0 otherwise. `review` findings are
 * printed and do not fail, because they need a human.
 *
 * DESIGN NOTE, learned the hard way. An earlier version of this idea would have
 * flagged "ClamAV" as sensitive. That is wrong: a malware scanner in an upload
 * pipeline is an ordinary thing to describe, and a tool that cries wolf about
 * ordinary architecture gets ignored, which is worse than not having it.
 *
 * What actually leaked was not a component. It was a hosting provider, a named
 * internal service, and a stated operational weakness, in one sentence, in a
 * public repository. No regular expression can judge that combination reliably,
 * so this scanner does the honest thing: it reports the ingredients at `review`
 * and only escalates to `block` when a provider and a weakness co-occur on one
 * line. The judgment stays with a person; the noticing is mechanized.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

export type Severity = "block" | "review";
export type Rule =
  | "credential"
  | "email"
  | "ip-address"
  | "infrastructure"
  | "infrastructure-with-weakness"
  | "home-path";

export interface Finding {
  file: string;
  line: number;
  rule: Rule;
  severity: Severity;
  match: string;
  message: string;
}

/** Addresses that are deliberately fine in published sample data or trailers. */
const ALLOWED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "anthropic.com",
  "sigmacomputing.com",
]);

const CREDENTIAL_PATTERNS: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{20,}\b/g, "API key"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "GitHub token"],
  [/\bAKIA[0-9A-Z]{12,}\b/g, "AWS access key id"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "Slack token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "private key"],
  [/\bglpat-[A-Za-z0-9_-]{16,}\b/g, "GitLab token"],
];

/** Hosting providers and infrastructure nouns worth a human glance. */
const INFRA = /\b(hetzner|digitalocean|linode|vultr|ovh|rackspace|ec2|rds instance|s3 bucket|cloudflare tunnel|bare metal|vps)\b/gi; // publication-guard: ignore

/** Phrases that turn "we use a host" into "here is how our host is weak". */
const WEAKNESS = /\b(without version control|no version control|no ci\b|not in git|plaintext|hard-?coded|unpatched|vulnerab|bypass|exploit|root (?:login|access|password)|scp'?d?\b|misconfigur)/i;

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const IPV4 = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;
const HOME_PATH = /\/(?:home|Users)\/[A-Za-z0-9._-]+\//g;

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage", "__pycache__",
]);
const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".zip", ".gz", ".duckdb",
  ".sqlite", ".db", ".ico", ".woff", ".woff2", ".lock",
]);

/** Show enough to locate it, never enough to use it. */
function redact(raw: string): string {
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 8)}…${raw.slice(-2)}`;
}

function isPrivateIp(a: number, b: number): boolean {
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254) ||
    a >= 224
  );
}

/**
 * Escape hatch, deliberately explicit. A file whose first 30 lines contain
 * `publication-guard: ignore-file` is skipped entirely; a single line ending in
 * `publication-guard: ignore` is skipped on its own.
 *
 * This exists because the scanner's own test fixtures are fake credentials, and
 * a tool that flags its own tests is a tool people learn to ignore. Anything
 * suppressed must be suppressed on purpose and visibly, in the file itself.
 */
const IGNORE_FILE = /publication-guard:\s*ignore-file/;
const IGNORE_LINE = /publication-guard:\s*ignore\b/;

export function scanText(text: string, file = "<memory>"): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split("\n");

  if (lines.slice(0, 30).some((l) => IGNORE_FILE.test(l))) return [];

  lines.forEach((raw, i) => {
    const line = i + 1;
    if (IGNORE_LINE.test(raw)) return;
    const add = (rule: Rule, severity: Severity, match: string, message: string): void => {
      findings.push({ file, line, rule, severity, match, message });
    };

    for (const [pattern, label] of CREDENTIAL_PATTERNS) {
      for (const m of raw.matchAll(pattern)) {
        add("credential", "block", redact(m[0]), `Looks like a ${label}. Rotate it, then remove it.`);
      }
    }

    for (const m of raw.matchAll(EMAIL)) {
      const domain = m[0].split("@")[1]?.toLowerCase() ?? "";
      if (ALLOWED_EMAIL_DOMAINS.has(domain)) continue;
      add("email", "block", m[0], "Real-looking address. Sample data should use example.com.");
    }

    for (const m of raw.matchAll(IPV4)) {
      const [a, b, c, d] = [m[1], m[2], m[3], m[4]].map(Number);
      if ([a, b, c, d].some((n) => n > 255)) continue;
      if (isPrivateIp(a, b)) continue;
      add("ip-address", "review", m[0], "Public IP address. Confirm it is not one of yours.");
    }

    const infra = [...raw.matchAll(INFRA)];
    if (infra.length > 0) {
      if (WEAKNESS.test(raw)) {
        add(
          "infrastructure-with-weakness",
          "block",
          infra[0][0],
          "A host or infrastructure noun on the same line as a stated weakness. " +
            "This is the combination that reads as reconnaissance rather than description.",
        );
      } else {
        add(
          "infrastructure",
          "review",
          infra[0][0],
          "Names infrastructure. Fine in most contexts — check it is not beside a service name or a weakness.",
        );
      }
    }

    for (const m of raw.matchAll(HOME_PATH)) {
      add("home-path", "review", m[0], "Absolute home path reveals a local username and layout.");
    }
  });

  return findings;
}

export function scanPath(root: string): Finding[] {
  const findings: Finding[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        visit(full);
      } else if (!SKIP_EXT.has(extname(entry).toLowerCase()) && stat.size < 2_000_000) {
        try {
          findings.push(...scanText(readFileSync(full, "utf8"), full));
        } catch {
          /* binary or unreadable; skip */
        }
      }
    }
  };
  const stat = statSync(root);
  if (stat.isDirectory()) visit(root);
  else findings.push(...scanText(readFileSync(root, "utf8"), root));
  return findings;
}

function main(): void {
  const roots = process.argv.slice(2);
  if (roots.length === 0) roots.push(".");
  const root = roots.join(", ");
  const findings = roots.flatMap((r) => {
    try {
      return scanPath(r);
    } catch {
      return [];
    }
  });
  const blocking = findings.filter((f) => f.severity === "block");
  const review = findings.filter((f) => f.severity === "review");

  if (findings.length === 0) {
    console.log(`publication guard: nothing found in ${root}`);
    return;
  }

  const show = (list: Finding[], heading: string): void => {
    if (list.length === 0) return;
    console.log(`\n${heading}`);
    const byRule = new Map<string, Finding[]>();
    for (const f of list) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
    for (const [rule, group] of byRule) {
      console.log(`  ${rule} (${group.length})`);
      for (const f of group.slice(0, 5)) {
        console.log(`    ${f.file}:${f.line}  ${f.match}`);
      }
      if (group.length > 5) console.log(`    …and ${group.length - 5} more`);
      console.log(`    ${group[0].message}`);
    }
  };

  show(blocking, `BLOCKING (${blocking.length}) — do not publish until these are resolved:`);
  show(review, `REVIEW (${review.length}) — a person decides, the scanner cannot:`);

  if (blocking.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
