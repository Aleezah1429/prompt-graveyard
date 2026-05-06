import type { Session, Finding } from "../types.js";

type Op = "Read" | "Edit" | "Write";

interface FileEvent {
  op: Op;
  turnIndex: number;
}

export function detectThrashLoop(session: Session): Finding[] {
  const byFile = new Map<string, FileEvent[]>();

  for (const turn of session.turns) {
    for (const tu of turn.toolUses) {
      let op: Op | null = null;
      if (tu.name === "Read") op = "Read";
      else if (tu.name === "Edit" || tu.name === "MultiEdit") op = "Edit";
      else if (tu.name === "Write") op = "Write";
      if (!op) continue;
      const path = tu.input.file_path;
      if (typeof path !== "string") continue;
      const arr = byFile.get(path) ?? [];
      arr.push({ op, turnIndex: turn.index });
      byFile.set(path, arr);
    }
  }

  const findings: Finding[] = [];
  for (const [path, events] of byFile) {
    let thrashes = 0;
    const flaggedTurns = new Set<number>();
    for (let i = 0; i < events.length - 2; i++) {
      const a = events[i];
      const b = events[i + 1];
      const c = events[i + 2];
      const isEdit = (e: FileEvent) => e.op === "Edit" || e.op === "Write";
      if (isEdit(a) && b.op === "Read" && isEdit(c)) {
        thrashes += 1;
        flaggedTurns.add(a.turnIndex);
        flaggedTurns.add(b.turnIndex);
        flaggedTurns.add(c.turnIndex);
      }
    }
    if (thrashes === 0) continue;
    findings.push({
      detector: "thrash-loop",
      severity: thrashes >= 2 ? "high" : "warn",
      title: `Thrash loop on ${path} (${thrashes}× edit→read→edit)`,
      detail: `The file was edited, then re-read, then edited again. This pattern means the previous edit's output was already in context — re-reading just bloated context and the second edit could have used the in-memory state.`,
      turnIndices: [...flaggedTurns].sort((a, b) => a - b),
    });
  }
  return findings;
}
