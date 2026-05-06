import { Command } from "commander";
import { readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, isAbsolute, resolve } from "node:path";
import { parseSession } from "./parser.js";
import { analyze } from "./detectors/index.js";
import { renderReport } from "./report/terminal.js";
import { renderHtml } from "./report/html.js";
import { renderMarkdown } from "./report/markdown.js";
import { renderExplain, explainAsJson } from "./report/explain.js";
import { renderDiff, diffAsJson } from "./report/diff.js";
import { buildSuggestions, renderSuggestionsTerminal, renderSuggestionsMarkdown } from "./suggest.js";
import { startWatch } from "./watch.js";
import { buildHookSnippet, installHook, uninstallHook } from "./hook.js";
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
  .option("--md <path>", "Write a markdown report to the given path (great for PRs/issues)")
  .action((file: string | undefined, opts: { last?: boolean; cwd?: string; json?: boolean; html?: string; md?: string }) => {
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
    if (opts.md) {
      const out = isAbsolute(opts.md) ? opts.md : resolve(process.cwd(), opts.md);
      writeFileSync(out, renderMarkdown(report), "utf8");
      console.log(`Markdown report written to ${out}`);
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
  .command("explain")
  .description("Show the raw prompt + tool calls + result + verdict for a single turn")
  .argument("<turn>", "Turn index (0-based)")
  .argument("[file]", "Path to a session .jsonl (defaults to most recent for current project)")
  .option("--cwd <path>", "Project directory to analyze sessions for")
  .option("--json", "Output as JSON")
  .action((turnArg: string, file: string | undefined, opts: { cwd?: string; json?: boolean }) => {
    const sessionPath = resolveSessionPath(file, opts);
    if (!sessionPath) {
      console.error("No session found. Pass a .jsonl path or run inside a Claude Code project directory.");
      process.exit(1);
    }
    const turnIndex = parseInt(turnArg, 10);
    if (Number.isNaN(turnIndex) || turnIndex < 0) {
      console.error(`Invalid turn index: ${turnArg}`);
      process.exit(1);
    }
    const session = parseSession(sessionPath);
    const report = analyze(session);
    if (opts.json) {
      console.log(JSON.stringify(explainAsJson(report, turnIndex), null, 2));
    } else {
      console.log(renderExplain(report, turnIndex));
      console.log(`\nSource: ${sessionPath}`);
    }
  });

const hookCmd = program
  .command("hook")
  .description("Print or install a Claude Code Stop hook that runs prompt-graveyard automatically");

hookCmd
  .command("show", { isDefault: true })
  .description("Print the recommended settings.json snippet")
  .option("--out <path>", "Where the auto-report should be written", "/tmp/pg-latest.md")
  .option("--format <fmt>", "Output format: md | html | terminal", "md")
  .option("--bin <path>", "Path to the prompt-graveyard binary (defaults to current binary)")
  .action((opts: { out: string; format: string; bin?: string }) => {
    const fmt = opts.format === "html" || opts.format === "terminal" ? opts.format : "md";
    const binPath = opts.bin ?? process.argv[1] ?? "prompt-graveyard";
    const snippet = buildHookSnippet({ outputPath: opts.out, format: fmt, binPath });
    console.log("Add this to ~/.claude/settings.json (merging with any existing 'hooks' key):\n");
    console.log(JSON.stringify(snippet, null, 2));
    console.log("\nAfter saving, every Claude Code session that ends will write a report to:\n  " + opts.out);
  });

hookCmd
  .command("install")
  .description("Merge the Stop hook into ~/.claude/settings.json automatically")
  .option("--out <path>", "Where the auto-report should be written", "/tmp/pg-latest.md")
  .option("--format <fmt>", "Output format: md | html | terminal", "md")
  .option("--bin <path>", "Path to the prompt-graveyard binary (defaults to current binary)")
  .action((opts: { out: string; format: string; bin?: string }) => {
    const fmt = opts.format === "html" || opts.format === "terminal" ? opts.format : "md";
    const binPath = opts.bin ?? process.argv[1] ?? "prompt-graveyard";
    const result = installHook({ outputPath: opts.out, format: fmt, binPath });
    console.log(`Updated ${result.wrote}. New sessions will auto-write a report to ${opts.out}.`);
  });

hookCmd
  .command("uninstall")
  .description("Remove the prompt-graveyard Stop hook from ~/.claude/settings.json")
  .action(() => {
    const result = uninstallHook();
    if (result.removed === 0) {
      console.log("No prompt-graveyard hook found in settings.");
    } else {
      console.log(`Removed ${result.removed} prompt-graveyard hook(s) from ${result.wrote}.`);
    }
  });

program
  .command("watch")
  .description("Live mode — tail the active session and alert when waste patterns emerge")
  .argument("[file]", "Path to a session .jsonl (defaults to most recent for current project, auto-following new sessions)")
  .option("--cwd <path>", "Project directory to watch")
  .option("--interval <ms>", "Polling interval in milliseconds", "1500")
  .option("-v, --verbose", "Also print a one-line summary for each new turn")
  .action((file: string | undefined, opts: { cwd?: string; interval: string; verbose?: boolean }) => {
    const cwd = opts.cwd ? resolve(opts.cwd) : process.cwd();
    const interval = Math.max(250, parseInt(opts.interval, 10) || 1500);
    let sessionPath: string | undefined;
    if (file) {
      sessionPath = isAbsolute(file) ? file : resolve(process.cwd(), file);
      if (!existsSync(sessionPath)) {
        console.error(`Session file not found: ${sessionPath}`);
        process.exit(1);
      }
    }
    const stop = startWatch({ cwd, sessionPath, intervalMs: interval, verbose: opts.verbose });
    process.on("SIGINT", () => {
      stop();
      process.exit(0);
    });
  });

program
  .command("suggest")
  .description("Generate concrete CLAUDE.md improvement suggestions from a session")
  .argument("[file]", "Path to a session .jsonl (defaults to most recent for current project)")
  .option("--cwd <path>", "Project directory to analyze sessions for")
  .option("--md", "Output as Markdown (paste into CLAUDE.md or a PR)")
  .option("--json", "Output as JSON")
  .action((file: string | undefined, opts: { cwd?: string; md?: boolean; json?: boolean }) => {
    const sessionPath = resolveSessionPath(file, opts);
    if (!sessionPath) {
      console.error("No session found. Pass a .jsonl path or run inside a Claude Code project directory.");
      process.exit(1);
    }
    const session = parseSession(sessionPath);
    const report = analyze(session);
    const suggestions = buildSuggestions(report);
    if (opts.json) {
      console.log(JSON.stringify(suggestions, null, 2));
    } else if (opts.md) {
      console.log(renderSuggestionsMarkdown(suggestions));
    } else {
      console.log(renderSuggestionsTerminal(suggestions));
      console.log(`\nSource: ${sessionPath}`);
    }
  });

program
  .command("diff")
  .description("Compare two sessions side-by-side (tokens, cost, waste, detectors)")
  .argument("<a>", "Path to session A .jsonl")
  .argument("<b>", "Path to session B .jsonl")
  .option("--json", "Output as JSON")
  .action((aArg: string, bArg: string, opts: { json?: boolean }) => {
    const aPath = isAbsolute(aArg) ? aArg : resolve(process.cwd(), aArg);
    const bPath = isAbsolute(bArg) ? bArg : resolve(process.cwd(), bArg);
    if (!existsSync(aPath)) {
      console.error(`Session A not found: ${aPath}`);
      process.exit(1);
    }
    if (!existsSync(bPath)) {
      console.error(`Session B not found: ${bPath}`);
      process.exit(1);
    }
    const reportA = analyze(parseSession(aPath));
    const reportB = analyze(parseSession(bPath));
    if (opts.json) {
      console.log(JSON.stringify(diffAsJson(reportA, reportB), null, 2));
    } else {
      console.log(renderDiff(reportA, reportB));
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
