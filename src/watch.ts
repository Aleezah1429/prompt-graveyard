import { readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { parseSession } from "./parser.js";
import { analyze } from "./detectors/index.js";
import type { Finding, Session } from "./types.js";
import { formatUsd, pricingForModel, costForUsage } from "./pricing.js";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

function projectDirForCwd(cwd: string): string {
  const slug = cwd.replace(/\//g, "-");
  return join(PROJECTS_DIR, slug);
}

function newestSession(projectDir: string): string | null {
  if (!existsSync(projectDir)) return null;
  const files = readdirSync(projectDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const p = join(projectDir, f);
      return { path: p, mtime: statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.path ?? null;
}

function severityColor(s: Finding["severity"]): (x: string) => string {
  if (s === "high") return chalk.red.bold;
  if (s === "warn") return chalk.yellow;
  return chalk.gray;
}

function formatAlert(f: Finding): string {
  const sev = severityColor(f.severity)(`[${f.severity.toUpperCase()}]`);
  const tokens = f.wastedTokens ? chalk.gray(` (~${f.wastedTokens.toLocaleString()} tok)`) : "";
  return `${sev} ${chalk.bold(f.detector)}: ${f.title}${tokens}`;
}

interface WatchState {
  sessionPath: string;
  seenTurnCount: number;
  alertedFingerprints: Set<string>;
}

function fingerprint(f: Finding): string {
  return `${f.detector}|${f.title}|${f.turnIndices.join(",")}`;
}

function emitAlerts(session: Session, findings: Finding[], state: WatchState): void {
  const newTurnIds = new Set<number>();
  for (let i = state.seenTurnCount; i < session.turns.length; i++) newTurnIds.add(i);
  for (const f of findings) {
    if (!f.turnIndices.some((i) => newTurnIds.has(i))) continue;
    const fp = fingerprint(f);
    if (state.alertedFingerprints.has(fp)) continue;
    state.alertedFingerprints.add(fp);
    process.stderr.write(formatAlert(f) + "\n");
  }
}

function emitTurnLine(session: Session, idx: number): void {
  const t = session.turns[idx];
  if (!t) return;
  const u = t.usage;
  if (!u) return;
  const total =
    (u.input_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0) +
    (u.output_tokens ?? 0);
  const cost = costForUsage(u, pricingForModel(t.model));
  const role = t.role === "assistant" ? chalk.cyan(t.role) : chalk.gray(t.role);
  const tools = t.toolUses.length > 0 ? chalk.gray(` · ${t.toolUses.length} tool${t.toolUses.length === 1 ? "" : "s"}`) : "";
  process.stderr.write(
    chalk.gray(`turn ${idx} `) + role + chalk.gray(` · ${total.toLocaleString()} tok · ${formatUsd(cost)}${tools}\n`)
  );
}

export interface WatchOptions {
  cwd: string;
  intervalMs?: number;
  sessionPath?: string;
  verbose?: boolean;
}

export function startWatch(opts: WatchOptions): () => void {
  const projectDir = projectDirForCwd(opts.cwd);
  const interval = opts.intervalMs ?? 1500;

  let state: WatchState | null = null;
  if (opts.sessionPath) {
    state = { sessionPath: opts.sessionPath, seenTurnCount: 0, alertedFingerprints: new Set() };
  }

  process.stderr.write(chalk.bold.magenta("💀 Prompt Graveyard — watching for waste\n"));
  if (opts.sessionPath) {
    process.stderr.write(chalk.gray(`Session: ${opts.sessionPath}\n`));
  } else {
    process.stderr.write(chalk.gray(`Project dir: ${projectDir}\n`));
  }
  process.stderr.write(chalk.gray("─".repeat(60) + "\n"));

  const tick = (): void => {
    try {
      if (!opts.sessionPath) {
        const latest = newestSession(projectDir);
        if (!latest) return;
        if (!state || state.sessionPath !== latest) {
          state = { sessionPath: latest, seenTurnCount: 0, alertedFingerprints: new Set() };
          process.stderr.write(chalk.gray(`▸ tracking ${latest}\n`));
        }
      }
      if (!state) return;
      if (!existsSync(state.sessionPath)) return;

      const session = parseSession(state.sessionPath);
      if (session.turns.length <= state.seenTurnCount) return;

      const report = analyze(session);
      if (opts.verbose) {
        for (let i = state.seenTurnCount; i < session.turns.length; i++) emitTurnLine(session, i);
      }
      emitAlerts(session, report.findings, state);
      state.seenTurnCount = session.turns.length;
    } catch {
      // ignore parse errors during partial writes
    }
  };

  const handle = setInterval(tick, interval);
  tick();
  return () => clearInterval(handle);
}
