import type { Session, Report } from "./types.js";

export interface Suggestion {
  kind: "document-file" | "document-command" | "trim-claude-md" | "fix-thrash";
  reason: string;
  hint: string;
  evidence: string[];
}

const NOISE_FILES = /\.(log|lock|map)$|node_modules|dist\//i;

function topRepeatedReads(session: Session, minRepeats = 2): { path: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const turn of session.turns) {
    for (const tu of turn.toolUses) {
      if (tu.name !== "Read") continue;
      const p = tu.input.file_path;
      if (typeof p !== "string") continue;
      if (NOISE_FILES.test(p)) continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minRepeats)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count);
}

function topRepeatedBash(session: Session, minRepeats = 2): { command: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const turn of session.turns) {
    for (const tu of turn.toolUses) {
      if (tu.name !== "Bash") continue;
      const c = tu.input.command;
      if (typeof c !== "string") continue;
      counts.set(c.trim(), (counts.get(c.trim()) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minRepeats)
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count);
}

export function buildSuggestions(report: Report): Suggestion[] {
  const out: Suggestion[] = [];
  const session = report.session;

  const reads = topRepeatedReads(session).slice(0, 5);
  if (reads.length > 0) {
    out.push({
      kind: "document-file",
      reason: `${reads.length} file(s) were read multiple times in this session.`,
      hint: `Add a "Key files" section to your CLAUDE.md so Claude doesn't have to re-discover them. Paste the paths and a 1-line description of each.`,
      evidence: reads.map((r) => `${r.path} (read ${r.count}×)`),
    });
  }

  const bash = topRepeatedBash(session).slice(0, 5);
  if (bash.length > 0) {
    out.push({
      kind: "document-command",
      reason: `${bash.length} shell command(s) were re-run during this session.`,
      hint: `Add a "Common commands" section to CLAUDE.md so Claude reuses your conventions instead of re-deriving them.`,
      evidence: bash.map((b) => `${b.command.length > 80 ? b.command.slice(0, 77) + "…" : b.command} (×${b.count})`),
    });
  }

  const stale = report.findings.filter((f) => f.detector === "stale-CLAUDE-md");
  if (stale.length > 0) {
    out.push({
      kind: "trim-claude-md",
      reason: `CLAUDE.md was re-read ${stale.length === 1 ? "once" : `${stale.length} times`} this session — it may be too large to stay cached, or the answers in it aren't authoritative enough.`,
      hint: `Trim CLAUDE.md so the whole file stays in cache (target <2k tokens). Move long examples to dedicated docs and link to them.`,
      evidence: stale.map((s) => s.title),
    });
  }

  const thrash = report.findings.filter((f) => f.detector === "thrash-loop");
  if (thrash.length > 0) {
    out.push({
      kind: "fix-thrash",
      reason: `${thrash.length} file(s) were edited → re-read → edited again.`,
      hint: `Tell Claude in your prompt: "after you edit a file, trust the diff — don't re-read unless you need to verify a specific line." Or pin a CLAUDE.md note to that effect.`,
      evidence: thrash.map((t) => t.title),
    });
  }

  return out;
}

export function renderSuggestionsTerminal(suggestions: Suggestion[]): string {
  if (suggestions.length === 0) return "No CLAUDE.md improvements detected for this session. 🎉";
  const lines: string[] = [];
  lines.push("\n💡 CLAUDE.md improvement suggestions");
  lines.push("─".repeat(60));
  for (const s of suggestions) {
    lines.push(`\n▸ [${s.kind}] ${s.reason}`);
    lines.push(`    → ${s.hint}`);
    for (const e of s.evidence.slice(0, 5)) {
      lines.push(`      · ${e}`);
    }
  }
  return lines.join("\n");
}

export function renderSuggestionsMarkdown(suggestions: Suggestion[]): string {
  if (suggestions.length === 0) return `# CLAUDE.md suggestions\n\nNo improvements detected. 🎉`;
  const lines: string[] = [];
  lines.push(`# CLAUDE.md improvement suggestions`);
  lines.push("");
  for (const s of suggestions) {
    lines.push(`## ${s.kind}`);
    lines.push("");
    lines.push(`**Why:** ${s.reason}  `);
    lines.push(`**How:** ${s.hint}`);
    lines.push("");
    if (s.evidence.length > 0) {
      lines.push(`Evidence:`);
      for (const e of s.evidence) lines.push(`- \`${e}\``);
      lines.push("");
    }
  }
  return lines.join("\n");
}
