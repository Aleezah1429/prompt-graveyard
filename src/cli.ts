import { Command } from "commander";
import { readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, isAbsolute, resolve } from "node:path";
import { parseSession } from "./parser.js";
import { analyze } from "./detectors/index.js";
import { renderReport } from "./report/terminal.js";
import { renderHtml } from "./report/html.js";
import { sweep } from "./sweep.js";
import { renderSweep } from "./report/sweep.js";

const program = new Command();

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

function listSessions(projectDir: string): { path: string; mtime: number }[] {
  if (!existsSync(projectDir)) return [];
  return readdirSync(projectDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const p = join(projectDir, f);
      return { path: p, mtime: statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function projectDirForCwd(cwd: string): string {
  const slug = cwd.replace(/\//g, "-");
  return join(PROJECTS_DIR, slug);
}

function resolveSessionPath(input: string | undefined, opts: { last?: boolean; cwd?: string }): string | null {
  if (input) {
    const p = isAbsolute(input) ? input : resolve(process.cwd(), input);
    return existsSync(p) ? p : null;
  }
  const cwd = opts.cwd ? resolve(opts.cwd) : process.cwd();
  const projectDir = projectDirForCwd(cwd);
  const sessions = listSessions(projectDir);
  if (sessions.length === 0) return null;
  return sessions[0].path;
}

program
  .name("prompt-graveyard")
  .description("Postmortem analysis for Claude Code sessions — find waste in prompts, file reads, and context.")
  .version("0.0.1");

program
  .command("analyze", { isDefault: true })
  .argument("[file]", "Path to a session .jsonl (defaults to most recent for current project)")
  .option("--last", "Use the most recent session for this project (default behavior)")
  .option("--cwd <path>", "Project directory to analyze sessions for")
  .option("--json", "Output raw findings as JSON")
  .option("--html <path>", "Write a self-contained HTML report to the given path")
  .action((file: string | undefined, opts: { last?: boolean; cwd?: string; json?: boolean; html?: string }) => {
    const sessionPath = resolveSessionPath(file, opts);
    if (!sessionPath) {
      console.error("No session found. Pass a .jsonl path or run inside a Claude Code project directory.");
      console.error(`Looked in: ${projectDirForCwd(opts.cwd ? resolve(opts.cwd) : process.cwd())}`);
      process.exit(1);
    }
    const session = parseSession(sessionPath);
    const report = analyze(session);
    if (opts.html) {
      const out = isAbsolute(opts.html) ? opts.html : resolve(process.cwd(), opts.html);
      writeFileSync(out, renderHtml(report), "utf8");
      console.log(`HTML report written to ${out}`);
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(renderReport(report));
      console.log(`\nSource: ${sessionPath}`);
    }
  });

program
  .command("list")
  .description("List recent sessions for the current project")
  .option("--cwd <path>", "Project directory")
  .option("-n, --limit <count>", "How many to show", "10")
  .action((opts: { cwd?: string; limit: string }) => {
    const cwd = opts.cwd ? resolve(opts.cwd) : process.cwd();
    const sessions = listSessions(projectDirForCwd(cwd));
    if (sessions.length === 0) {
      console.error(`No sessions in ${projectDirForCwd(cwd)}`);
      process.exit(1);
    }
    const limit = Math.max(1, parseInt(opts.limit, 10) || 10);
    for (const s of sessions.slice(0, limit)) {
      const date = new Date(s.mtime).toISOString();
      console.log(`${date}  ${s.path}`);
    }
  });

program
  .command("sweep")
  .description("Scan ALL Claude Code sessions across all projects and rank the worst offenders")
  .option("-n, --limit <count>", "How many rows to show", "20")
  .option("--min-turns <count>", "Skip sessions with fewer turns than this", "5")
  .option("--json", "Output raw rows as JSON")
  .action((opts: { limit: string; minTurns: string; json?: boolean }) => {
    const limit = Math.max(1, parseInt(opts.limit, 10) || 20);
    const minTurns = Math.max(1, parseInt(opts.minTurns, 10) || 5);
    let lastPct = -1;
    const rows = sweep({
      minTurns,
      onProgress: (cur, total) => {
        if (opts.json) return;
        const pct = Math.floor((cur / total) * 100);
        if (pct !== lastPct) {
          process.stderr.write(`\rScanning… ${cur}/${total} (${pct}%)`);
          lastPct = pct;
        }
      },
    });
    if (!opts.json) process.stderr.write("\r" + " ".repeat(40) + "\r");
    if (opts.json) {
      console.log(JSON.stringify(rows.slice(0, limit), null, 2));
    } else {
      console.log(renderSweep(rows.slice(0, limit)));
    }
  });

program.parseAsync(process.argv);
