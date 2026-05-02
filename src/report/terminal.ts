import chalk from "chalk";
import Table from "cli-table3";
import type { Report, Finding } from "../types.js";

function fmt(n: number): string {
  return n.toLocaleString();
}

function severityColor(s: Finding["severity"]): (x: string) => string {
  if (s === "high") return chalk.red.bold;
  if (s === "warn") return chalk.yellow;
  return chalk.gray;
}

function scoreColor(score: number): (x: string) => string {
  if (score >= 30) return chalk.red.bold;
  if (score >= 15) return chalk.yellow;
  return chalk.green;
}

export function renderReport(report: Report): string {
  const { session, findings, wasteScore } = report;
  const lines: string[] = [];

  lines.push(chalk.bold.magenta("\n💀 Prompt Graveyard"));
  lines.push(chalk.gray("─".repeat(60)));
  lines.push(`${chalk.bold("Session")}    ${session.sessionId}`);
  lines.push(`${chalk.bold("Project")}    ${session.cwd}`);
  if (session.gitBranch) lines.push(`${chalk.bold("Branch")}     ${session.gitBranch}`);
  lines.push(`${chalk.bold("Turns")}      ${session.turns.length}`);
  lines.push(`${chalk.bold("Started")}    ${session.startedAt}`);
  lines.push("");

  const totals = session.totals;
  const tokens = new Table({ head: ["Token type", "Count"], colAligns: ["left", "right"] });
  tokens.push(
    ["Input (uncached)", fmt(totals.inputTokens)],
    ["Cache creation", fmt(totals.cacheCreationTokens)],
    ["Cache read", fmt(totals.cacheReadTokens)],
    ["Output", fmt(totals.outputTokens)],
    [chalk.bold("Total"), chalk.bold(fmt(totals.grandTotal))]
  );
  lines.push(tokens.toString());
  lines.push("");

  lines.push(
    `${chalk.bold("Waste score")} ${scoreColor(wasteScore)(`${wasteScore}/100`)}  ${chalk.gray(
      "(higher = more tokens likely wasted)"
    )}`
  );
  lines.push("");

  if (findings.length === 0) {
    lines.push(chalk.green("No waste patterns detected. 🎉"));
    return lines.join("\n");
  }

  const grouped = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = grouped.get(f.detector) ?? [];
    arr.push(f);
    grouped.set(f.detector, arr);
  }

  for (const [detector, items] of grouped) {
    lines.push(chalk.bold.cyan(`▸ ${detector}  (${items.length})`));
    for (const f of items.slice(0, 8)) {
      const sev = severityColor(f.severity)(`[${f.severity.toUpperCase()}]`);
      lines.push(`  ${sev} ${f.title}`);
      lines.push(chalk.gray(`         ${f.detail}`));
      if (f.wastedTokens) {
        lines.push(chalk.gray(`         ~${fmt(f.wastedTokens)} tokens implicated`));
      }
    }
    if (items.length > 8) {
      lines.push(chalk.gray(`  …and ${items.length - 8} more`));
    }
    lines.push("");
  }

  return lines.join("\n");
}
