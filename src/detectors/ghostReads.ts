import type { Session, Finding, ToolResult } from "../types.js";

const MIN_GHOST_BYTES = 800;

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((w) => w.length >= 5)
  );
}

function distinctiveTokens(text: string, max = 60): string[] {
  const counts = new Map<string, number>();
  for (const w of tokenize(text)) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.keys()]
    .filter((w) => !COMMON.has(w))
    .slice(0, max);
}

const COMMON = new Set([
  "function", "return", "string", "number", "boolean", "object", "array", "import",
  "export", "const", "default", "async", "await", "private", "public", "protected",
  "interface", "extends", "implements", "static", "throw", "catch", "error", "value",
  "result", "params", "options", "config", "module", "package", "files", "branch",
  "commit", "github", "claude", "session", "input", "output", "tokens",
]);

export function detectGhostReads(session: Session): Finding[] {
  const findings: Finding[] = [];
  const resultsById = new Map<string, ToolResult>();
  for (const turn of session.turns) {
    for (const r of turn.toolResults) resultsById.set(r.toolUseId, r);
  }

  for (const turn of session.turns) {
    if (turn.role !== "assistant") continue;
    for (const tu of turn.toolUses) {
      if (!["Read", "Grep", "WebFetch", "Bash"].includes(tu.name)) continue;
      const result = resultsById.get(tu.id);
      if (!result || result.bytes < MIN_GHOST_BYTES) continue;

      const sample = distinctiveTokens(result.text);
      if (sample.length < 5) continue;

      const futureText = session.turns
        .filter((t) => t.index > turn.index && t.role === "assistant")
        .slice(0, 4)
        .map((t) => `${t.text}\n${t.toolUses.map((u) => JSON.stringify(u.input)).join("\n")}`)
        .join("\n")
        .toLowerCase();

      if (!futureText) continue;

      const hits = sample.filter((w) => futureText.includes(w)).length;
      const usageRatio = hits / sample.length;
      if (usageRatio >= 0.1) continue;

      const label =
        tu.name === "Read"
          ? `Read ${tu.input.file_path}`
          : tu.name === "Bash"
          ? `Bash ${(tu.input.command as string)?.slice(0, 50) ?? ""}`
          : tu.name === "Grep"
          ? `Grep ${tu.input.pattern}`
          : `${tu.name}`;
      findings.push({
        detector: "ghost-read",
        severity: result.bytes > 5000 ? "warn" : "info",
        title: `Ghost read on turn ${turn.index}: ${label}`,
        detail: `Tool result was ${result.bytes.toLocaleString()} bytes but barely any of its distinctive content surfaced in later turns (${Math.round(
          usageRatio * 100
        )}% match rate). Likely loaded but not used.`,
        wastedTokens: Math.round(result.bytes / 4),
        turnIndices: [turn.index],
      });
    }
  }
  return findings;
}
