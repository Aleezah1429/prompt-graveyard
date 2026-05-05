import chalk from "chalk";
import Table from "cli-table3";
import type { SweepRow } from "../sweep.js";
import { formatUsd } from "../pricing.js";

function fmt(n: number): string {
  return n.toLocaleString();
}

function shorten(s: string, max = 50): string {
  if (s.length <= max) return s;
  return "…" + s.slice(s.length - max + 1);
}

function scoreCell(score: number): string {
  if (score >= 30) return chalk.red.bold(`${score}`);
  if (score >= 15) return chalk.yellow(`${score}`);
  return chalk.green(`${score}`);
}

export function renderSweep(rows: SweepRow[]): string {
  if (rows.length === 0) return "No sessions found across ~/.claude/projects.";
  const table = new Table({
    head: ["#", "Score", "Turns", "API $", "Wasted $", "Project", "Top finding"],
    colAligns: ["right", "right", "right", "right", "right", "left", "left"],
    style: { head: ["cyan"] },
  });
  const totals = rows.reduce(
    (acc, r) => {
      acc.cost += r.costUsd;
      acc.wasted += r.wastedCostUsd;
      return acc;
    },
    { cost: 0, wasted: 0 }
  );
  rows.forEach((r, i) => {
    table.push([
      String(i + 1),
      scoreCell(r.wasteScore),
      fmt(r.turns),
      formatUsd(r.costUsd),
      chalk.red(formatUsd(r.wastedCostUsd)),
      shorten(r.cwd),
      r.topFinding ? shorten(r.topFinding, 50) : chalk.gray("—"),
    ]);
  });
  const header = chalk.bold.magenta("\n💀 Prompt Graveyard — Sweep");
  const sub = chalk.gray(`Worst sessions across all projects (${rows.length} shown)\n`);
  const footer = chalk.gray(
    `\nTotals (at public API rates, not what you paid on subscription): ${formatUsd(
      totals.cost
    )} · ${chalk.red(formatUsd(totals.wasted))} ${chalk.gray("estimated waste")}`
  );
  return `${header}\n${sub}${table.toString()}${footer}`;
}
