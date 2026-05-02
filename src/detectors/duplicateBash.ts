import type { Session, Finding } from "../types.js";

export function detectDuplicateBash(session: Session): Finding[] {
  const cmds = new Map<string, number[]>();

  for (const turn of session.turns) {
    for (const tu of turn.toolUses) {
      if (tu.name !== "Bash") continue;
      const command = tu.input.command;
      if (typeof command !== "string") continue;
      const key = command.trim();
      const arr = cmds.get(key) ?? [];
      arr.push(turn.index);
      cmds.set(key, arr);
    }
  }

  const findings: Finding[] = [];
  for (const [cmd, indices] of cmds) {
    if (indices.length < 2) continue;
    const preview = cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd;
    findings.push({
      detector: "duplicate-bash",
      severity: indices.length >= 3 ? "high" : "warn",
      title: `Bash repeated ${indices.length}×: ${preview}`,
      detail: `Identical command run on turns ${indices.join(", ")}. If the output didn't change, the re-run was wasted; if it did, consider piping to a file once and re-reading.`,
      turnIndices: indices,
    });
  }
  return findings;
}
