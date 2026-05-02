import type { Session, Finding } from "../types.js";

const SPIKE_THRESHOLD = 20_000;

export function detectTokenSpikes(session: Session): Finding[] {
  const findings: Finding[] = [];

  for (const turn of session.turns) {
    if (turn.role !== "assistant" || !turn.usage) continue;
    const created = turn.usage.cache_creation_input_tokens ?? 0;
    if (created >= SPIKE_THRESHOLD) {
      findings.push({
        detector: "token-spike",
        severity: created >= 50_000 ? "high" : "warn",
        title: `Cache rebuild on turn ${turn.index}: ${created.toLocaleString()} tokens written`,
        detail: `Large cache_creation_input_tokens means the prefix changed enough to invalidate the cache. Frequent rebuilds compound — every later turn re-reads this prefix.`,
        wastedTokens: created,
        turnIndices: [turn.index],
      });
    }
  }
  return findings;
}

export function detectLowOutputTurns(session: Session): Finding[] {
  const findings: Finding[] = [];
  for (const turn of session.turns) {
    if (turn.role !== "assistant" || !turn.usage) continue;
    const out = turn.usage.output_tokens ?? 0;
    const inp =
      (turn.usage.input_tokens ?? 0) +
      (turn.usage.cache_read_input_tokens ?? 0) +
      (turn.usage.cache_creation_input_tokens ?? 0);
    if (inp < 5000) continue;
    if (out >= 50) continue;
    if (turn.toolUses.length > 0) continue;
    findings.push({
      detector: "low-output-turn",
      severity: "info",
      title: `Turn ${turn.index}: ${inp.toLocaleString()} tokens in, ${out} out, no action`,
      detail: `Heavy context loaded but the assistant produced almost nothing actionable. Often a sign of an unclear prompt or premature thinking.`,
      wastedTokens: inp,
      turnIndices: [turn.index],
    });
  }
  return findings;
}
