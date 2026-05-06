import type { Session, Finding, ToolResult } from "../types.js";

function isClaudeMd(path: string): boolean {
  return /(?:^|\/)CLAUDE\.md$/i.test(path);
}

export function detectStaleClaudeMd(session: Session): Finding[] {
  const reads: { turnIndex: number; path: string; resultId: string }[] = [];
  const resultsById = new Map<string, ToolResult>();
  for (const turn of session.turns) {
    for (const r of turn.toolResults) resultsById.set(r.toolUseId, r);
  }

  for (const turn of session.turns) {
    for (const tu of turn.toolUses) {
      if (tu.name !== "Read") continue;
      const path = tu.input.file_path;
      if (typeof path !== "string") continue;
      if (!isClaudeMd(path)) continue;
      reads.push({ turnIndex: turn.index, path, resultId: tu.id });
    }
  }

  const findings: Finding[] = [];

  const byPath = new Map<string, typeof reads>();
  for (const r of reads) {
    const arr = byPath.get(r.path) ?? [];
    arr.push(r);
    byPath.set(r.path, arr);
  }

  for (const [path, events] of byPath) {
    if (events.length < 2) continue;
    const result = resultsById.get(events[0].resultId);
    const wastedBytes = (events.length - 1) * (result?.bytes ?? 0);
    findings.push({
      detector: "stale-CLAUDE-md",
      severity: events.length >= 3 ? "high" : "warn",
      title: `CLAUDE.md re-read ${events.length}× at ${path}`,
      detail: `CLAUDE.md is supposed to be persistent context — if Claude is re-reading it on multiple turns, either it's getting evicted, or it's not authoritative enough to satisfy the question. Consider trimming it (so it stays cached) or making the answers more direct.`,
      wastedTokens: wastedBytes > 0 ? Math.round(wastedBytes / 4) : undefined,
      turnIndices: events.map((e) => e.turnIndex),
    });
  }

  return findings;
}
