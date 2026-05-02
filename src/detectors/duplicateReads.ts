import type { Session, Finding } from "../types.js";

export function detectDuplicateReads(session: Session): Finding[] {
  const reads = new Map<string, number[]>();

  for (const turn of session.turns) {
    for (const tu of turn.toolUses) {
      if (tu.name !== "Read") continue;
      const path = tu.input.file_path;
      if (typeof path !== "string") continue;
      const offset = tu.input.offset ?? "*";
      const limit = tu.input.limit ?? "*";
      const key = `${path}::${offset}::${limit}`;
      const arr = reads.get(key) ?? [];
      arr.push(turn.index);
      reads.set(key, arr);
    }
  }

  const findings: Finding[] = [];
  for (const [key, indices] of reads) {
    if (indices.length < 2) continue;
    const path = key.split("::")[0];
    const wastedReads = indices.length - 1;
    findings.push({
      detector: "duplicate-reads",
      severity: indices.length >= 4 ? "high" : "warn",
      title: `Read ${wastedReads}× redundantly: ${path}`,
      detail: `Same Read call across turns ${indices.join(", ")}. After the first read the file content sits in the conversation; re-reading just bloats context.`,
      turnIndices: indices,
    });
  }
  return findings;
}
