/**
 * Pure data-shaping functions for the Task 12 charts.
 *
 * No DuckDB, no rendering, no file I/O here — see renderCharts.ts for that.
 * These functions accept whatever subset of trial columns the caller has
 * (tests exercise a minimal shape; renderCharts.ts passes the full row from
 * `metrics.duckdb`, including `model` and `batch`, which are optional here
 * so the functions work for both).
 */

export type Verdict = "match" | "partial" | "wrong-order" | "missing" | string;
export type Status = "good" | "warning" | "critical";
export type Target = "inventory_daily" | "adjustments";

export interface TrialInput {
  run: string;
  arm: number;
  trial: number;
  gradeable: boolean;
  total_indexes: number;
  explicit_indexes?: number;
  in_scope_indexes?: number;
  composite_count: number;
  inventory_daily: Verdict;
  adjustments: Verdict;
  model?: string;
  batch?: string;
  ungradeable_reason?: string | null;
}

export interface VerdictRow {
  run: string;
  arm: number;
  trial: number;
  target: Target;
  verdict: Verdict;
  status: Status;
  label: string;
  gradeable: boolean;
  model?: string;
  batch?: string;
  ungradeable_reason?: string | null;
}

export interface CountRow {
  run: string;
  arm: number;
  trial: number;
  total_indexes: number;
  explicit_indexes: number;
  in_scope_indexes: number;
  composite_count: number;
  gradeable: boolean;
  model?: string;
  batch?: string;
}

const STATUS_BY_VERDICT: Record<string, Status> = {
  match: "good",
  partial: "warning",
  "wrong-order": "warning",
  missing: "critical",
};

const LABEL_BY_VERDICT: Record<string, string> = {
  match: "Match",
  partial: "Partial",
  "wrong-order": "Wrong order",
  missing: "Missing",
};

function statusFor(verdict: Verdict): Status {
  return STATUS_BY_VERDICT[verdict] ?? "critical";
}

function labelFor(verdict: Verdict): string {
  return LABEL_BY_VERDICT[verdict] ?? String(verdict);
}

/** One row per trial per graded target (inventory_daily, adjustments). */
export function verdictRows(trials: TrialInput[]): VerdictRow[] {
  const targets: Target[] = ["inventory_daily", "adjustments"];
  const rows: VerdictRow[] = [];
  for (const t of trials) {
    for (const target of targets) {
      const verdict = t[target];
      rows.push({
        run: t.run,
        arm: t.arm,
        trial: t.trial,
        target,
        verdict,
        status: statusFor(verdict),
        label: labelFor(verdict),
        gradeable: t.gradeable,
        model: t.model,
        batch: t.batch,
        ungradeable_reason: t.ungradeable_reason ?? null,
      });
    }
  }
  return rows;
}

/** One row per trial, including ungradeable ones — never dropped. */
export function countRows(trials: TrialInput[]): CountRow[] {
  return trials.map((t) => ({
    run: t.run,
    arm: t.arm,
    trial: t.trial,
    total_indexes: t.total_indexes,
    explicit_indexes: t.explicit_indexes ?? 0,
    in_scope_indexes: t.in_scope_indexes ?? 0,
    composite_count: t.composite_count,
    gradeable: t.gradeable,
    model: t.model,
    batch: t.batch,
  }));
}

/**
 * A gradeable-only mean, with its n, for a given numeric key — used so the
 * caption/table can print "9.0 (n=4)" instead of silently averaging over an
 * ungradeable trial's stored 0. Returns null mean when n is 0.
 */
export function meanWithN(
  rows: CountRow[],
  key: "total_indexes" | "explicit_indexes" | "in_scope_indexes",
): { mean: number | null; n: number } {
  const gradeableRows = rows.filter((r) => r.gradeable);
  const n = gradeableRows.length;
  if (n === 0) return { mean: null, n: 0 };
  const sum = gradeableRows.reduce((acc, r) => acc + r[key], 0);
  return { mean: Math.round((sum / n) * 100) / 100, n };
}
