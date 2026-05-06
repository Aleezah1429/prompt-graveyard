import chalk from "chalk";
import Table from "cli-table3";
import type { Report } from "../types.js";
import { formatUsd } from "../pricing.js";

function fmt(n: number): string {
  return n.toLocaleString();
}

function delta(a: number, b: number): string {
  const d = b - a;
  if (d === 0) return chalk.gray("=");
  const pct = a === 0 ? null : Math.round((d / a) * 100);
  const sign = d > 0 ? "+" : "";
  const display = pct === null ? `${sign}${fmt(d)}` : `${sign}${fmt(d)} (${sign}${pct}%)`;
  return d > 0 ? chalk.red(display) : chalk.green(display);
}

function deltaUsd(a: number, b: number): string {
  const d = b - a;
  if (Math.abs(d) < 0.005) return chalk.gray("=");
  const sign = d > 0 ? "+" : "-";
  const display = `${sign}${formatUsd(Math.abs(d))}`;
  return d > 0 ? chalk.red(display) : chalk.green(display);
}

function findingsByDetector(report: Report): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of report.findings) m.set(f.detector, (m.get(f.detector) ?? 0) + 1);
  return m;
}

export function renderDiff(a: Report, b: Report): string {
  const lines: string[] = [];
  lines.push(chalk.bold.magenta("\n💀 Prompt Graveyard — Diff"));
  lines.push(chalk.gray("─".repeat(60)));
  lines.push(`${chalk.bold("A")}  ${a.session.sessionId}  (${a.session.turns.length} turns)`);
  lines.push(`${chalk.bold("B")}  ${b.session.sessionId}  (${b.session.turns.length} turns)`);
  lines.push("");

  const t = new Table({
    head: ["Metric", "A", "B", "Δ (B − A)"],
    colAligns: ["left", "right", "right", "right"],
    style: { head: ["cyan"] },
  });
  const at = a.session.totals;
  const bt = b.session.totals;
  t.push(
    ["Turns", fmt(a.session.turns.length), fmt(b.session.turns.length), delta(a.session.turns.length, b.session.turns.length)],
    ["Total tokens", fmt(at.grandTotal), fmt(bt.grandTotal), delta(at.grandTotal, bt.grandTotal)],
    ["Input (uncached)", fmt(at.inputTokens), fmt(bt.inputTokens), delta(at.inputTokens, bt.inputTokens)],
    ["Cache creation", fmt(at.cacheCreationTokens), fmt(bt.cacheCreationTokens), delta(at.cacheCreationTokens, bt.cacheCreationTokens)],
    ["Cache read", fmt(at.cacheReadTokens), fmt(bt.cacheReadTokens), delta(at.cacheReadTokens, bt.cacheReadTokens)],
    ["Output", fmt(at.outputTokens), fmt(bt.outputTokens), delta(at.outputTokens, bt.outputTokens)],
    ["API-equivalent cost", formatUsd(at.costUsd), formatUsd(bt.costUsd), deltaUsd(at.costUsd, bt.costUsd)],
    ["Waste score", `${a.wasteScore}/100`, `${b.wasteScore}/100`, delta(a.wasteScore, b.wasteScore)],
    ["Wasted $", formatUsd(a.wastedCostUsd), formatUsd(b.wastedCostUsd), deltaUsd(a.wastedCostUsd, b.wastedCostUsd)],
    ["Findings", fmt(a.findings.length), fmt(b.findings.length), delta(a.findings.length, b.findings.length)]
  );
  lines.push(t.toString());
  lines.push("");

  const fa = findingsByDetector(a);
  const fb = findingsByDetector(b);
  const detectors = new Set<string>([...fa.keys(), ...fb.keys()]);
  if (detectors.size > 0) {
    lines.push(chalk.bold.cyan("▸ Findings by detector"));
    const dt = new Table({
      head: ["Detector", "A", "B", "Δ"],
      colAligns: ["left", "right", "right", "right"],
      style: { head: ["cyan"] },
    });
    for (const d of [...detectors].sort()) {
      const av = fa.get(d) ?? 0;
      const bv = fb.get(d) ?? 0;
      dt.push([d, String(av), String(bv), delta(av, bv)]);
    }
    lines.push(dt.toString());
    lines.push("");
  }

  const overallDelta = b.wastedCostUsd - a.wastedCostUsd;
  if (Math.abs(overallDelta) >= 0.01) {
    const verdict =
      overallDelta > 0
        ? chalk.red(`B wasted ${formatUsd(Math.abs(overallDelta))} more than A`)
        : chalk.green(`B wasted ${formatUsd(Math.abs(overallDelta))} less than A`);
    lines.push(`${chalk.bold("Verdict")}  ${verdict}`);
  } else {
    lines.push(`${chalk.bold("Verdict")}  ${chalk.gray("waste roughly equal")}`);
  }

  return lines.join("\n");
}

export function diffAsJson(a: Report, b: Report): unknown {
  const fa = findingsByDetector(a);
  const fb = findingsByDetector(b);
  const detectors = [...new Set([...fa.keys(), ...fb.keys()])].sort();
  return {
    a: {
      sessionId: a.session.sessionId,
      turns: a.session.turns.length,
      totals: a.session.totals,
      wasteScore: a.wasteScore,
      wastedCostUsd: a.wastedCostUsd,
      findings: a.findings.length,
    },
    b: {
      sessionId: b.session.sessionId,
      turns: b.session.turns.length,
      totals: b.session.totals,
      wasteScore: b.wasteScore,
      wastedCostUsd: b.wastedCostUsd,
      findings: b.findings.length,
    },
    findingsByDetector: Object.fromEntries(detectors.map((d) => [d, { a: fa.get(d) ?? 0, b: fb.get(d) ?? 0 }])),
  };
}
