/**
 * Renders the Task 12 charts from experiments/indexing/metrics.duckdb.
 *
 * Two batches live in the same `trials` table and MUST NEVER be pooled:
 *   - batch = 'pilot'       10 trials, one model (claude-opus-5[1m]), arm-grouped run order
 *   - batch = 'crossmodel'  30 trials, three models (claude/gemini/codex), interleaved
 *
 * The crossmodel batch is charted as the primary figures (per the Task 12
 * ambiguity resolution). The pilot is charted separately, clearly labelled,
 * and never merged into the same axes as crossmodel.
 *
 * Every trial is plotted individually — no aggregate-only chart, no percentages.
 * Means are gradeable-only and always printed with their n.
 *
 * Outputs (all written to charts/out/, all self-contained, no external requests):
 *   verdict-grid.svg           crossmodel verdict grid (30 rows), light mode
 *   verdict-grid-pilot.svg     pilot verdict grid (10 rows), light mode
 *   index-count.svg            crossmodel index-count strip plot, light mode
 *   index-count-pilot.svg      pilot index-count strip plot, light mode
 *   charts.html                all four, light+dark, tooltip, and a table view
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";
import { JSDOM } from "jsdom";
import * as Plot from "@observablehq/plot";
import {
  countRows,
  meanWithN,
  verdictRows,
  type CountRow,
  type TrialInput,
  type VerdictRow,
} from "./shapeData.ts";

const DB_PATH = fileURLToPath(new URL("../experiments/indexing/metrics.duckdb", import.meta.url));
const OUT_DIR = fileURLToPath(new URL("./out/", import.meta.url));

type Mode = "light" | "dark";

// ---- Palette — validated 2026-08-02, values used verbatim, do not substitute ----

const SURFACE: Record<Mode, string> = { light: "#fcfcfb", dark: "#1a1a19" };
const PAGE_PLANE: Record<Mode, string> = { light: "#f9f9f7", dark: "#0d0d0d" };
const INK_PRIMARY: Record<Mode, string> = { light: "#0b0b0b", dark: "#ffffff" };
const INK_SECONDARY: Record<Mode, string> = { light: "#52514e", dark: "#c3c2b7" };
const INK_MUTED: Record<Mode, string> = { light: "#898781", dark: "#898781" };
const GRIDLINE: Record<Mode, string> = { light: "#e1e0d9", dark: "#2c2c2a" };
const BASELINE: Record<Mode, string> = { light: "#c3c2b7", dark: "#383835" };

const ARM_COLOR: Record<Mode, Record<1 | 2, string>> = {
  light: { 1: "#2a78d6", 2: "#eb6834" },
  dark: { 1: "#3987e5", 2: "#d95926" },
};

// Status palette is fixed — same three steps in both modes (palette.md).
const STATUS_COLOR = { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b" } as const;

const ARM_LABEL: Record<1 | 2, string> = {
  1: "Arm 1 (no “production scale” sentence)",
  2: "Arm 2 (+ “production scale” sentence)",
};

const MODEL_ORDER = ["claude", "gemini", "codex"] as const;
const MODEL_DISPLAY: Record<string, string> = {
  claude: "claude-opus-4-8",
  gemini: "gemini-3.6-flash (fast tier)",
  codex: "Codex (codex-cli, self-reported GPT-5, unverified)",
};

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

// ---------------------------------------------------------------------------
// DB access
// ---------------------------------------------------------------------------

interface DbRow extends TrialInput {
  model_version?: string | null;
  cost_usd?: number | null;
}

async function loadTrials(): Promise<DbRow[]> {
  const instance = await DuckDBInstance.create(DB_PATH);
  const connection = await instance.connect();
  const reader = await connection.runAndReadAll(
    `SELECT run, arm, trial, gradeable, total_indexes, explicit_indexes,
            in_scope_indexes, composite_count, inventory_daily, adjustments,
            model, model_version, cost_usd, batch, ungradeable_reason
     FROM trials
     ORDER BY batch, model, arm, trial`,
  );
  const rows = reader.getRowObjects() as unknown as DbRow[];
  connection.closeSync();
  return rows;
}

// ---------------------------------------------------------------------------
// Small SVG DOM helpers
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

function el(
  document: Document,
  tag: string,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as unknown as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 0xff) * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Greedy word-wrap at an approximate character budget (no text measurement in jsdom). */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Wrap a rendered chart body in a titled SVG figure — the body svg element is nested as-is. */
function composeFigure(
  document: Document,
  opts: {
    title: string;
    subtitle: string;
    body: SVGElement;
    bodyWidth: number;
    bodyHeight: number;
    mode: Mode;
    legend?: SVGElement;
    legendHeight?: number;
  },
): SVGElement {
  const pad = 20;
  const maxChars = Math.max(40, Math.floor((opts.bodyWidth) / 6.2));
  const subtitleLines = wrapText(opts.subtitle, maxChars);
  const titleBand = 40 + subtitleLines.length * 16 + 6;
  const legendHeight = opts.legend ? (opts.legendHeight ?? 24) : 0;
  const width = opts.bodyWidth + pad * 2;
  const height = titleBand + opts.bodyHeight + legendHeight + pad * 2;

  const svg = el(document, "svg", {
    xmlns: SVG_NS,
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    "font-family": FONT,
  });

  svg.appendChild(
    el(document, "rect", { x: 0, y: 0, width, height, fill: SURFACE[opts.mode] }),
  );
  svg.appendChild(
    el(
      document,
      "text",
      { x: pad, y: pad + 18, "font-size": 16, "font-weight": 600, fill: INK_PRIMARY[opts.mode] },
      opts.title,
    ),
  );
  subtitleLines.forEach((line, i) => {
    svg.appendChild(
      el(
        document,
        "text",
        {
          x: pad,
          y: pad + 36 + i * 16,
          "font-size": 12,
          fill: INK_SECONDARY[opts.mode],
        },
        line,
      ),
    );
  });

  if (opts.legend) {
    opts.legend.setAttribute("transform", `translate(${pad}, ${pad + titleBand - 12})`);
    svg.appendChild(opts.legend);
  }

  opts.body.setAttribute("x", String(pad));
  opts.body.setAttribute("y", String(pad + titleBand + legendHeight));
  svg.appendChild(opts.body);

  return svg;
}

function statusLegend(document: Document, mode: Mode): SVGElement {
  const g = el(document, "g", {});
  const entries: [string, string][] = [
    ["good", "Match"],
    ["warning", "Partial"],
    ["warning", "Wrong order (hatched)"],
    ["critical", "Missing"],
  ];
  let x = 0;
  entries.forEach(([status, label], i) => {
    const color = STATUS_COLOR[status as keyof typeof STATUS_COLOR];
    g.appendChild(el(document, "rect", { x, y: -10, width: 12, height: 12, rx: 3, fill: color }));
    if (label.includes("hatched")) {
      g.appendChild(
        el(document, "rect", {
          x,
          y: -10,
          width: 12,
          height: 12,
          rx: 3,
          fill: `url(#hatch-${mode})`,
        }),
      );
    }
    const t = el(
      document,
      "text",
      { x: x + 17, y: 0, "font-size": 11, fill: INK_SECONDARY[mode] },
      label,
    );
    g.appendChild(t);
    x += 17 + label.length * 6 + 18;
  });
  return g;
}

function armLegend(document: Document, mode: Mode, maxWidth: number): SVGElement {
  const g = el(document, "g", {});
  const itemWidth = ([1, 2] as const).map((arm) => 15 + ARM_LABEL[arm].length * 5.6 + 24);
  const fitsOnOneLine = itemWidth[0] + itemWidth[1] <= maxWidth;
  let x = 0;
  let y = 0;
  ([1, 2] as const).forEach((arm, i) => {
    g.appendChild(
      el(document, "circle", { cx: x + 5, cy: y - 4, r: 5, fill: ARM_COLOR[mode][arm] }),
    );
    const t = el(
      document,
      "text",
      { x: x + 15, y, "font-size": 11, fill: INK_SECONDARY[mode] },
      ARM_LABEL[arm],
    );
    g.appendChild(t);
    if (fitsOnOneLine) {
      x += itemWidth[i];
    } else {
      y += 16;
    }
  });
  return g;
}

function hatchDefs(document: Document, mode: Mode): SVGElement {
  const defs = el(document, "defs", {});
  const ink = darken(STATUS_COLOR.warning, 0.45);
  const pattern = el(document, "pattern", {
    id: `hatch-${mode}`,
    patternUnits: "userSpaceOnUse",
    width: 6,
    height: 6,
    patternTransform: "rotate(45)",
  });
  pattern.appendChild(el(document, "rect", { width: 6, height: 6, fill: "none" }));
  pattern.appendChild(
    el(document, "line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: ink, "stroke-width": 2 }),
  );
  defs.appendChild(pattern);

  const grayPattern = el(document, "pattern", {
    id: `hatch-gray-${mode}`,
    patternUnits: "userSpaceOnUse",
    width: 6,
    height: 6,
    patternTransform: "rotate(45)",
  });
  grayPattern.appendChild(el(document, "rect", { width: 6, height: 6, fill: "none" }));
  grayPattern.appendChild(
    el(document, "line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 6,
      stroke: INK_MUTED[mode],
      "stroke-width": 2,
    }),
  );
  defs.appendChild(grayPattern);
  return defs;
}

// ---------------------------------------------------------------------------
// Verdict grid — one row per trial, one chip per graded target
// ---------------------------------------------------------------------------

interface GridGroup {
  heading: string;
  rows: { rowLabel: string; run: string; gradeable: boolean; reason: string | null }[];
}

const TARGETS: { key: VerdictRow["target"]; header: string }[] = [
  { key: "inventory_daily", header: "InventoryDaily (store_id, snapshot_date)" },
  { key: "adjustments", header: "Adjustments (store_id, product_id)" },
];

function buildVerdictGridSvg(
  document: Document,
  vRows: VerdictRow[],
  groups: GridGroup[],
  mode: Mode,
  title: string,
  subtitle: string,
): SVGElement {
  const chipW = 300;
  const chipGap = 2;
  const rowH = 26;
  const rowGap = 2;
  const labelW = 230;
  const headerH = 20;
  const groupGapH = 18;

  const bodyWidth = labelW + TARGETS.length * (chipW + chipGap);
  let y = headerH + 6;
  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);
  const bodyHeight =
    headerH + 6 + totalRows * (rowH + rowGap) + groups.length * groupGapH + 10;

  const body = el(document, "svg", { width: bodyWidth, height: bodyHeight, overflow: "visible" });
  body.appendChild(hatchDefs(document, mode));

  // column headers
  TARGETS.forEach((t, i) => {
    body.appendChild(
      el(
        document,
        "text",
        {
          x: labelW + i * (chipW + chipGap) + chipW / 2,
          y: 14,
          "font-size": 11,
          "font-weight": 600,
          "text-anchor": "middle",
          fill: INK_SECONDARY[mode],
        },
        t.header,
      ),
    );
  });

  const byRun = new Map<string, VerdictRow[]>();
  for (const r of vRows) {
    const list = byRun.get(r.run) ?? [];
    list.push(r);
    byRun.set(r.run, list);
  }

  for (const group of groups) {
    body.appendChild(
      el(
        document,
        "text",
        { x: 0, y: y + 12, "font-size": 12, "font-weight": 600, fill: INK_PRIMARY[mode] },
        group.heading,
      ),
    );
    y += groupGapH;

    for (const row of group.rows) {
      body.appendChild(
        el(
          document,
          "text",
          { x: 0, y: y + rowH / 2 + 4, "font-size": 11, fill: INK_SECONDARY[mode] },
          row.rowLabel,
        ),
      );

      if (!row.gradeable) {
        const w = TARGETS.length * (chipW + chipGap) - chipGap;
        body.appendChild(
          el(document, "rect", {
            x: labelW,
            y,
            width: w,
            height: rowH,
            rx: 4,
            fill: `url(#hatch-gray-${mode})`,
          }),
        );
        body.appendChild(
          el(document, "rect", {
            x: labelW,
            y,
            width: w,
            height: rowH,
            rx: 4,
            fill: "none",
            stroke: BASELINE[mode],
            "stroke-width": 1,
          }),
        );
        body.appendChild(
          el(
            document,
            "text",
            {
              x: labelW + 10,
              y: y + rowH / 2 + 4,
              "font-size": 11,
              fill: INK_PRIMARY[mode],
            },
            `Ungradeable — ${row.reason ?? "no reason recorded"}`,
          ),
        );
        y += rowH + rowGap;
        continue;
      }

      const cells = byRun.get(row.run) ?? [];
      TARGETS.forEach((t, i) => {
        const cell = cells.find((c) => c.target === t.key);
        const x = labelW + i * (chipW + chipGap);
        const color = cell ? STATUS_COLOR[cell.status] : STATUS_COLOR.critical;
        body.appendChild(
          el(document, "rect", { x, y, width: chipW, height: rowH, rx: 4, fill: color }),
        );
        if (cell?.verdict === "wrong-order") {
          body.appendChild(
            el(document, "rect", {
              x,
              y,
              width: chipW,
              height: rowH,
              rx: 4,
              fill: `url(#hatch-${mode})`,
            }),
          );
        }
        const icon =
          cell?.status === "good" ? "✓" : cell?.status === "critical" ? "✕" : "◐";
        body.appendChild(
          el(
            document,
            "text",
            {
              x: x + 10,
              y: y + rowH / 2 + 4,
              "font-size": 11,
              "font-weight": 600,
              fill: "#0b0b0b",
            },
            `${icon} ${cell?.label ?? "Unknown"}`,
          ),
        );
      });
      y += rowH + rowGap;
    }
  }

  const legend = statusLegend(document, mode);
  return composeFigure(document, {
    title,
    subtitle,
    body,
    bodyWidth,
    bodyHeight,
    mode,
    legend,
    legendHeight: 20,
  });
}

// ---------------------------------------------------------------------------
// Index-count strip plot — one dot per trial, faceted, one axis
// ---------------------------------------------------------------------------

interface StripPoint {
  run: string;
  model: string;
  modelDisplay: string;
  metricKey: "explicit_indexes" | "in_scope_indexes";
  metricLabel: string;
  arm: 1 | 2;
  armLabel: string;
  trial: number;
  value: number;
  gradeable: boolean;
}

const METRICS: { key: StripPoint["metricKey"]; label: string }[] = [
  { key: "explicit_indexes", label: "Explicit" },
  { key: "in_scope_indexes", label: "In-scope" },
];

function toStripPoints(rows: CountRow[], modelOrder: string[]): StripPoint[] {
  const points: StripPoint[] = [];
  for (const r of rows) {
    const model = r.model ?? "";
    for (const m of METRICS) {
      points.push({
        run: r.run,
        model,
        modelDisplay: MODEL_DISPLAY[model] ?? model,
        metricKey: m.key,
        metricLabel: m.label,
        arm: r.arm as 1 | 2,
        armLabel: ARM_LABEL[r.arm as 1 | 2],
        trial: r.trial,
        value: r[m.key],
        gradeable: r.gradeable,
      });
    }
  }
  return points;
}

function buildStripSvg(
  document: Document,
  points: StripPoint[],
  mode: Mode,
  title: string,
  subtitle: string,
  facetByModel: boolean,
  annotations: Record<string, string> = {},
): SVGElement {
  const gradeablePoints = points.filter((p) => p.gradeable);
  const metricLabels = METRICS.map((m) => m.label);
  const modelDomain = facetByModel
    ? MODEL_ORDER.map((m) => MODEL_DISPLAY[m])
    : undefined;

  const marks: Plot.Markish[] = [
    Plot.gridY({ stroke: GRIDLINE[mode] }),
    Plot.frame({ stroke: BASELINE[mode] }),
    Plot.dot(gradeablePoints, {
      x: "trial",
      y: "value",
      fx: facetByModel ? "modelDisplay" : undefined,
      fy: "metricLabel",
      fill: "armLabel",
      r: 5,
      stroke: SURFACE[mode],
      strokeWidth: 2,
      title: (d: StripPoint) => `${d.run}\n${d.metricLabel}: ${d.value}\n${d.armLabel}`,
    }),
  ];

  // ungradeable trials — drawn, hatched (as an outlined open marker + label), never omitted
  const ungradeable = points.filter((p) => !p.gradeable);
  if (ungradeable.length > 0) {
    marks.push(
      Plot.dot(ungradeable, {
        x: "trial",
        y: () => 0,
        fx: facetByModel ? "modelDisplay" : undefined,
        fy: "metricLabel",
        r: 6,
        fill: "none",
        stroke: INK_MUTED[mode],
        strokeWidth: 2,
        strokeDasharray: "2,2",
      }),
      Plot.text(ungradeable, {
        x: "trial",
        y: () => 0,
        fx: facetByModel ? "modelDisplay" : undefined,
        fy: "metricLabel",
        text: () => "ungradeable",
        dy: 14,
        fontSize: 9,
        fill: INK_MUTED[mode],
      }),
    );
  }

  if (facetByModel) {
    for (const [model, note] of Object.entries(annotations)) {
      const display = MODEL_DISPLAY[model] ?? model;
      marks.push(
        Plot.text([{ modelDisplay: display, metricLabel: metricLabels[0] }], {
          x: 3,
          y: () => Math.max(...gradeablePoints.map((p) => p.value)) + 2,
          fx: "modelDisplay",
          fy: "metricLabel",
          text: () => note,
          fontSize: 10,
          fontWeight: 600,
          fill: STATUS_COLOR.warning,
        }),
      );
    }
  }

  const plot = Plot.plot({
    document,
    width: facetByModel ? 760 : 420,
    height: facetByModel ? 340 : 300,
    marginLeft: 46,
    marginRight: 60,
    marginBottom: 34,
    style: { background: "none", color: INK_PRIMARY[mode], fontFamily: FONT },
    x: { label: "trial (run order within arm)", domain: [1, 2, 3, 4, 5], ticks: [1, 2, 3, 4, 5] },
    y: { label: "index count", grid: false, nice: true, zero: true },
    fx: modelDomain ? { domain: modelDomain, label: null } : undefined,
    fy: { domain: metricLabels, label: null },
    color: {
      domain: [ARM_LABEL[1], ARM_LABEL[2]],
      range: [ARM_COLOR[mode][1], ARM_COLOR[mode][2]],
      legend: false,
    },
    marks,
  }) as unknown as SVGElement;

  const bodyWidth = facetByModel ? 760 : 420;
  const legend = armLegend(document, mode, bodyWidth);
  const legendItemWidths = ([1, 2] as const).map((arm) => 15 + ARM_LABEL[arm].length * 5.6 + 24);
  const legendFits = legendItemWidths[0] + legendItemWidths[1] <= bodyWidth;
  return composeFigure(document, {
    title,
    subtitle,
    body: plot,
    bodyWidth,
    bodyHeight: facetByModel ? 340 : 300,
    mode,
    legend,
    legendHeight: legendFits ? 20 : 36,
  });
}

// ---------------------------------------------------------------------------
// Table view — the required relief for the warning color's contrast WARN
// ---------------------------------------------------------------------------

function buildTableHtml(document: Document, allRows: DbRow[]): string {
  const header = [
    "batch",
    "model",
    "run",
    "arm",
    "trial",
    "gradeable",
    "total_indexes",
    "explicit_indexes",
    "in_scope_indexes",
    "composite_count",
    "inventory_daily",
    "adjustments",
  ];
  const body = allRows
    .map((r) => {
      const cells = [
        r.batch ?? "",
        r.model ?? "",
        r.run,
        r.arm,
        r.trial,
        r.gradeable ? "yes" : "no",
        r.total_indexes,
        r.gradeable ? (r.explicit_indexes ?? 0) : "—",
        r.gradeable ? (r.in_scope_indexes ?? 0) : "—",
        r.composite_count,
        r.gradeable ? r.inventory_daily : "ungradeable",
        r.gradeable ? r.adjustments : "ungradeable",
      ];
      return `<tr>${cells.map((c) => `<td>${escapeHtml(String(c))}</td>`).join("")}</tr>`;
    })
    .join("\n");
  return `<table class="data-table">
    <thead><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const allRows = await loadTrials();

  const pilotRows = allRows.filter((r) => r.batch === "pilot");
  const crossRows = allRows.filter((r) => r.batch === "crossmodel");

  if (pilotRows.length !== 10) {
    throw new Error(
      `Expected exactly 10 pilot trials in metrics.duckdb, found ${pilotRows.length}. ` +
        `Refusing to render a chart that quietly has fewer rows than the run produced.`,
    );
  }
  if (crossRows.length !== 30) {
    throw new Error(
      `Expected exactly 30 crossmodel trials in metrics.duckdb, found ${crossRows.length}. ` +
        `Refusing to render a chart that quietly has fewer rows than the run produced.`,
    );
  }
  for (const model of MODEL_ORDER) {
    const n = crossRows.filter((r) => r.model === model).length;
    if (n !== 10) {
      throw new Error(`Expected 10 crossmodel trials for model="${model}", found ${n}.`);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const document = dom.window.document as unknown as Document;

  // ---- Verdict grids -------------------------------------------------
  const crossVerdict = verdictRows(crossRows);
  const crossGroups: GridGroup[] = MODEL_ORDER.map((model) => ({
    heading: MODEL_DISPLAY[model],
    rows: crossRows
      .filter((r) => r.model === model)
      .map((r) => ({
        rowLabel: `arm ${r.arm} · trial ${r.trial}`,
        run: r.run,
        gradeable: r.gradeable,
        reason: r.ungradeable_reason ?? null,
      })),
  }));

  const verdictGridCross = buildVerdictGridSvg(
    document,
    crossVerdict,
    crossGroups,
    "light",
    "Verdict grid — cross-model replication (30 trials, interleaved)",
    "batch=crossmodel · claude-opus-4-8, gemini-3.6-flash, Codex · never pooled with the pilot batch below",
  );
  writeFileSync(`${OUT_DIR}verdict-grid.svg`, verdictGridCross.outerHTML);

  const pilotVerdict = verdictRows(pilotRows);
  const pilotGroups: GridGroup[] = [
    {
      heading: "claude-opus-5[1m] — pilot batch",
      rows: pilotRows.map((r) => ({
        rowLabel: `arm ${r.arm} · trial ${r.trial}`,
        run: r.run,
        gradeable: r.gradeable,
        reason: r.ungradeable_reason ?? null,
      })),
    },
  ];
  const verdictGridPilot = buildVerdictGridSvg(
    document,
    pilotVerdict,
    pilotGroups,
    "light",
    "Verdict grid — pilot (10 trials, one model)",
    "batch=pilot · claude-opus-5[1m] · arm 1 run entirely before arm 2 (not interleaved) · shown separately, not comparable to the chart above",
  );
  writeFileSync(`${OUT_DIR}verdict-grid-pilot.svg`, verdictGridPilot.outerHTML);

  // ---- Strip plots -----------------------------------------------------
  const crossCounts = countRows(crossRows);
  const crossPoints = toStripPoints(crossCounts, [...MODEL_ORDER]);
  const stripCross = buildStripSvg(
    document,
    crossPoints,
    "light",
    "Index counts by trial — cross-model replication",
    "Every dot is one trial, n=5 per cell. Explicit = total minus CREATE UNIQUE INDEX; in-scope = explicit, restricted to the two graded tables. gemini-3.6-flash is a fast tier beside two frontier-tier tools — a tier gap, not evidence Gemini reasons worse about indexes.",
    true,
    { gemini: "fast tier ↑" },
  );
  writeFileSync(`${OUT_DIR}index-count.svg`, stripCross.outerHTML);

  const pilotCounts = countRows(pilotRows);
  const pilotPoints = toStripPoints(pilotCounts, []);
  const stripPilot = buildStripSvg(
    document,
    pilotPoints,
    "light",
    "Index counts by trial — pilot",
    "batch=pilot, n=5 per arm. Explicit = total minus CREATE UNIQUE INDEX; in-scope = explicit, restricted to the two graded tables. Arm 1 ran entirely before arm 2 — run order and arm are confounded here (see RESULTS.md).",
    false,
  );
  writeFileSync(`${OUT_DIR}index-count-pilot.svg`, stripPilot.outerHTML);

  // ---- Dark-mode variants, for the HTML page ---------------------------
  const verdictGridCrossDark = buildVerdictGridSvg(
    document,
    crossVerdict,
    crossGroups,
    "dark",
    "Verdict grid — cross-model replication (30 trials, interleaved)",
    "batch=crossmodel · claude-opus-4-8, gemini-3.6-flash, Codex · never pooled with the pilot batch below",
  );
  const verdictGridPilotDark = buildVerdictGridSvg(
    document,
    pilotVerdict,
    pilotGroups,
    "dark",
    "Verdict grid — pilot (10 trials, one model)",
    "batch=pilot · claude-opus-5[1m] · arm 1 run entirely before arm 2 (not interleaved) · shown separately, not comparable to the chart above",
  );
  const stripCrossDark = buildStripSvg(
    document,
    crossPoints,
    "dark",
    "Index counts by trial — cross-model replication",
    "Every dot is one trial, n=5 per cell. Explicit = total minus CREATE UNIQUE INDEX; in-scope = explicit, restricted to the two graded tables. gemini-3.6-flash is a fast tier beside two frontier-tier tools — a tier gap, not evidence Gemini reasons worse about indexes.",
    true,
    { gemini: "fast tier ↑" },
  );
  const stripPilotDark = buildStripSvg(
    document,
    pilotPoints,
    "dark",
    "Index counts by trial — pilot",
    "batch=pilot, n=5 per arm. Explicit = total minus CREATE UNIQUE INDEX; in-scope = explicit, restricted to the two graded tables. Arm 1 ran entirely before arm 2 — run order and arm are confounded here (see RESULTS.md).",
    false,
  );

  // ---- Headline means, gradeable-only, n printed beside every one -------
  const meanLines: string[] = [];
  for (const model of MODEL_ORDER) {
    for (const arm of [1, 2] as const) {
      const rows = crossCounts.filter((r) => r.model === model && r.arm === arm);
      const explicit = meanWithN(rows, "explicit_indexes");
      const inScope = meanWithN(rows, "in_scope_indexes");
      meanLines.push(
        `<tr><td>${MODEL_DISPLAY[model]}</td><td>arm ${arm}</td><td>${explicit.n}</td>` +
          `<td>${explicit.mean ?? "—"}</td><td>${inScope.mean ?? "—"}</td></tr>`,
      );
    }
  }
  for (const arm of [1, 2] as const) {
    const rows = pilotCounts.filter((r) => r.arm === arm);
    const explicit = meanWithN(rows, "explicit_indexes");
    const inScope = meanWithN(rows, "in_scope_indexes");
    meanLines.push(
      `<tr><td>claude-opus-5[1m] (pilot)</td><td>arm ${arm}</td><td>${explicit.n}</td>` +
        `<td>${explicit.mean ?? "—"}</td><td>${inScope.mean ?? "—"}</td></tr>`,
    );
  }

  const tableHtml = buildTableHtml(document, allRows);

  const html = buildPage({
    verdictGridCrossLight: verdictGridCross.outerHTML,
    verdictGridCrossDark: verdictGridCrossDark.outerHTML,
    verdictGridPilotLight: verdictGridPilot.outerHTML,
    verdictGridPilotDark: verdictGridPilotDark.outerHTML,
    stripCrossLight: stripCross.outerHTML,
    stripCrossDark: stripCrossDark.outerHTML,
    stripPilotLight: stripPilot.outerHTML,
    stripPilotDark: stripPilotDark.outerHTML,
    meanRows: meanLines.join("\n"),
    tableHtml,
  });
  writeFileSync(`${OUT_DIR}charts.html`, html);

  console.log("Wrote:");
  console.log(`  ${OUT_DIR}verdict-grid.svg`);
  console.log(`  ${OUT_DIR}verdict-grid-pilot.svg`);
  console.log(`  ${OUT_DIR}index-count.svg`);
  console.log(`  ${OUT_DIR}index-count-pilot.svg`);
  console.log(`  ${OUT_DIR}charts.html`);
}

function buildPage(parts: {
  verdictGridCrossLight: string;
  verdictGridCrossDark: string;
  verdictGridPilotLight: string;
  verdictGridPilotDark: string;
  stripCrossLight: string;
  stripCrossDark: string;
  stripPilotLight: string;
  stripPilotDark: string;
  meanRows: string;
  tableHtml: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Indexing experiment — chart data (Task 12)</title>
<style>
  :root {
    color-scheme: light;
    --surface: #fcfcfb;
    --plane: #f9f9f7;
    --ink-primary: #0b0b0b;
    --ink-secondary: #52514e;
    --ink-muted: #898781;
    --border: rgba(11,11,11,0.10);
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) {
      color-scheme: dark;
      --surface: #1a1a19;
      --plane: #0d0d0d;
      --ink-primary: #ffffff;
      --ink-secondary: #c3c2b7;
      --ink-muted: #898781;
      --border: rgba(255,255,255,0.10);
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --surface: #1a1a19;
    --plane: #0d0d0d;
    --ink-primary: #ffffff;
    --ink-secondary: #c3c2b7;
    --ink-muted: #898781;
    --border: rgba(255,255,255,0.10);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--plane);
    color: var(--ink-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 24px 16px 64px;
  }
  main { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 28px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.lede { color: var(--ink-secondary); margin: 0 0 8px; max-width: 70ch; }
  .toolbar { display: flex; gap: 8px; align-items: center; }
  .toolbar button {
    font: inherit; font-size: 12px; padding: 6px 10px; border-radius: 6px;
    border: 1px solid var(--border); background: var(--surface); color: var(--ink-primary);
    cursor: pointer;
  }
  .toolbar button[aria-pressed="true"] { border-color: var(--ink-secondary); font-weight: 600; }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 4px;
    overflow-x: auto;
  }
  .card svg { display: block; width: 100%; height: auto; }
  .mode-dark { display: none; }
  [data-theme="dark"] .mode-light { display: none; }
  [data-theme="dark"] .mode-dark { display: block; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .mode-light { display: none; }
    :root:not([data-theme="light"]) .mode-dark { display: block; }
  }
  table.data-table, table.mean-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  table.data-table th, table.data-table td,
  table.mean-table th, table.mean-table td {
    border-bottom: 1px solid var(--border);
    padding: 6px 8px;
    text-align: left;
    white-space: nowrap;
  }
  table.data-table { display: block; overflow-x: auto; }
  caption, .table-caption { text-align: left; color: var(--ink-secondary); font-size: 12px; margin-bottom: 6px; }
  #tooltip {
    position: fixed;
    pointer-events: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--ink-primary);
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    display: none;
    z-index: 10;
    max-width: 260px;
  }
  #tooltip .value { font-weight: 700; }
  footer { color: var(--ink-muted); font-size: 11px; margin-top: 8px; }
</style>
</head>
<body>
<main>
  <div>
    <h1>Indexing experiment — chart data</h1>
    <p class="lede">
      Every trial is plotted individually. No percentages anywhere — n is 5 per cell.
      The cross-model batch (30 trials, interleaved) and the pilot batch (10 trials,
      one model, arm-grouped) are shown as separate charts and are never pooled.
    </p>
    <div class="toolbar" role="group" aria-label="Theme">
      <button type="button" data-theme-btn="system" aria-pressed="true">System</button>
      <button type="button" data-theme-btn="light" aria-pressed="false">Light</button>
      <button type="button" data-theme-btn="dark" aria-pressed="false">Dark</button>
    </div>
  </div>

  <section class="card" data-chart="verdict-cross">
    <div class="mode-light">${parts.verdictGridCrossLight}</div>
    <div class="mode-dark">${parts.verdictGridCrossDark}</div>
  </section>

  <section class="card" data-chart="verdict-pilot">
    <div class="mode-light">${parts.verdictGridPilotLight}</div>
    <div class="mode-dark">${parts.verdictGridPilotDark}</div>
  </section>

  <section class="card" data-chart="strip-cross">
    <div class="mode-light">${parts.stripCrossLight}</div>
    <div class="mode-dark">${parts.stripCrossDark}</div>
  </section>

  <section class="card" data-chart="strip-pilot">
    <div class="mode-light">${parts.stripPilotLight}</div>
    <div class="mode-dark">${parts.stripPilotDark}</div>
  </section>

  <section>
    <div class="table-caption">
      Gradeable-only means, n printed beside every one. total_indexes (not shown here as a
      mean) includes CREATE UNIQUE INDEX rows Prisma emits mechanically plus indexes outside
      the two graded tables — explicit_indexes and in_scope_indexes are the measures this
      project treats as primary.
    </div>
    <table class="mean-table">
      <thead><tr><th>model</th><th>arm</th><th>n (gradeable)</th><th>mean explicit_indexes</th><th>mean in_scope_indexes</th></tr></thead>
      <tbody>${parts.meanRows}</tbody>
    </table>
  </section>

  <section>
    <div class="table-caption">
      Every trial, both batches — the relief view for the warning color's sub-3:1 light-mode
      contrast. "—" marks fields not meaningful for an ungradeable trial.
    </div>
    ${parts.tableHtml}
  </section>

  <footer>
    experiments/indexing/metrics.duckdb · batch=pilot (10 trials) and batch=crossmodel (30 trials) ·
    see experiments/indexing/RESULTS.md for full caveats and confounds.
  </footer>
</main>

<div id="tooltip" role="tooltip"></div>

<script>
(function () {
  "use strict";

  var root = document.documentElement;
  var buttons = document.querySelectorAll("[data-theme-btn]");
  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var choice = btn.getAttribute("data-theme-btn");
      if (choice === "system") {
        root.removeAttribute("data-theme");
      } else {
        root.setAttribute("data-theme", choice);
      }
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", String(b === btn));
      });
    });
  });

  var tooltip = document.getElementById("tooltip");

  function showTooltip(evt, text) {
    tooltip.textContent = "";
    var lines = text.split("\\n");
    lines.forEach(function (line, i) {
      var div = document.createElement("div");
      if (i === 1) div.className = "value";
      div.textContent = line;
      tooltip.appendChild(div);
    });
    tooltip.style.display = "block";
    positionTooltip(evt);
  }

  function positionTooltip(evt) {
    var x = evt.clientX + 14;
    var y = evt.clientY + 14;
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  }

  function hideTooltip() {
    tooltip.style.display = "none";
  }

  document.querySelectorAll("section.card").forEach(function (card) {
    card.addEventListener("pointermove", function (evt) {
      var target = evt.target;
      if (target && target.tagName === "title") return;
      var titled = target && target.closest ? target.closest("[aria-label], title") : null;
      var withTitle = target && target.closest ? target.closest("g") : null;
      var titleEl = withTitle ? withTitle.querySelector("title") : null;
      if (titleEl && titleEl.textContent) {
        showTooltip(evt, titleEl.textContent);
      } else if (target && target.querySelector && target.querySelector("title")) {
        showTooltip(evt, target.querySelector("title").textContent);
      } else {
        hideTooltip();
      }
    });
    card.addEventListener("pointerleave", hideTooltip);
  });
})();
</script>
</body>
</html>
`;
}

await main();
