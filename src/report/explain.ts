import chalk from "chalk";
import type { Report, Turn, ToolResult } from "../types.js";
import { formatUsd, pricingForModel, costForUsage } from "../pricing.js";

function fmt(n: number): string {
  return n.toLocaleString();
}

function truncate(s: string, max = 600): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + chalk.gray(`\n  …(+${fmt(s.length - max)} chars truncated)`);
}

function indent(s: string, prefix = "    "): string {
  return s
    .split("\n")
    .map((l) => prefix + l)
    .join("\n");
}

export function renderExplain(report: Report, turnIndex: number): string {
  const session = report.session;
  const turn = session.turns[turnIndex];
  if (!turn) {
    return chalk.red(
      `Turn ${turnIndex} not found. Session has ${session.turns.length} turns (0..${session.turns.length - 1}).`
    );
  }

  const resultsById = new Map<string, ToolResult>();
  for (const t of session.turns) {
    for (const r of t.toolResults) resultsById.set(r.toolUseId, r);
  }

  const findingsForTurn = report.findings.filter((f) => f.turnIndices.includes(turnIndex));

  const lines: string[] = [];
  lines.push(chalk.bold.magenta(`\n💀 Turn ${turnIndex}  (${turn.role})`));
  lines.push(chalk.gray("─".repeat(60)));
  lines.push(`${chalk.bold("Time")}     ${turn.timestamp}`);
  if (turn.model) lines.push(`${chalk.bold("Model")}    ${turn.model}`);

  if (turn.usage) {
    const u = turn.usage;
    const pricing = pricingForModel(turn.model);
    const cost = costForUsage(u, pricing);
    const total =
      (u.input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0) +
      (u.output_tokens ?? 0);
    lines.push(
      `${chalk.bold("Tokens")}   in ${fmt(u.input_tokens ?? 0)} · cc ${fmt(
        u.cache_creation_input_tokens ?? 0
      )} · cr ${fmt(u.cache_read_input_tokens ?? 0)} · out ${fmt(u.output_tokens ?? 0)} · total ${fmt(total)}`
    );
    lines.push(`${chalk.bold("Cost")}     ${chalk.cyan(formatUsd(cost))}`);
  }
  lines.push("");

  if (turn.text) {
    lines.push(chalk.bold.cyan("▸ Message text"));
    lines.push(indent(truncate(turn.text)));
    lines.push("");
  }

  if (turn.thinking) {
    lines.push(chalk.bold.cyan("▸ Thinking"));
    lines.push(indent(truncate(turn.thinking, 400), "    " + chalk.gray("│ ")));
    lines.push("");
  }

  if (turn.toolUses.length > 0) {
    lines.push(chalk.bold.cyan(`▸ Tool calls (${turn.toolUses.length})`));
    for (const tu of turn.toolUses) {
      lines.push(`  ${chalk.bold(tu.name)} ${chalk.gray(tu.id)}`);
      const inputJson = JSON.stringify(tu.input, null, 2);
      lines.push(indent(truncate(inputJson, 400), "    "));
      const result = resultsById.get(tu.id);
      if (result) {
        lines.push(chalk.gray(`    └ result: ${fmt(result.bytes)} bytes (turn ${result.turnIndex})`));
        if (result.text) {
          lines.push(indent(chalk.gray(truncate(result.text, 300)), "      "));
        }
      }
      lines.push("");
    }
  }

  if (findingsForTurn.length > 0) {
    lines.push(chalk.bold.cyan(`▸ Verdict — ${findingsForTurn.length} finding(s) on this turn`));
    for (const f of findingsForTurn) {
      const sevColor =
        f.severity === "high" ? chalk.red.bold : f.severity === "warn" ? chalk.yellow : chalk.gray;
      lines.push(`  ${sevColor(`[${f.severity.toUpperCase()}]`)} ${chalk.bold(f.detector)}: ${f.title}`);
      lines.push(chalk.gray(`         ${f.detail}`));
      if (f.wastedTokens) lines.push(chalk.gray(`         ~${fmt(f.wastedTokens)} tokens implicated`));
    }
  } else {
    lines.push(chalk.bold.cyan("▸ Verdict") + chalk.green(" — no waste flags on this turn"));
  }
  lines.push("");

  return lines.join("\n");
}

export function explainAsJson(report: Report, turnIndex: number): unknown {
  const turn: Turn | undefined = report.session.turns[turnIndex];
  if (!turn) return { error: `turn ${turnIndex} not found`, turns: report.session.turns.length };
  const resultsById = new Map<string, ToolResult>();
  for (const t of report.session.turns) {
    for (const r of t.toolResults) resultsById.set(r.toolUseId, r);
  }
  return {
    turnIndex,
    role: turn.role,
    timestamp: turn.timestamp,
    model: turn.model,
    usage: turn.usage,
    text: turn.text,
    thinking: turn.thinking,
    toolUses: turn.toolUses.map((tu) => {
      const result = resultsById.get(tu.id);
      return {
        name: tu.name,
        id: tu.id,
        input: tu.input,
        result: result ? { bytes: result.bytes, text: result.text, turnIndex: result.turnIndex } : null,
      };
    }),
    findings: report.findings.filter((f) => f.turnIndices.includes(turnIndex)),
  };
}
