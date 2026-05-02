import type { Session, Report } from "../types.js";
import { detectDuplicateReads } from "./duplicateReads.js";
import { detectDuplicateBash } from "./duplicateBash.js";
import { detectTokenSpikes, detectLowOutputTurns } from "./tokenSpikes.js";
import { detectGhostReads } from "./ghostReads.js";

export function analyze(session: Session): Report {
  const findings = [
    ...detectDuplicateReads(session),
    ...detectDuplicateBash(session),
    ...detectTokenSpikes(session),
    ...detectLowOutputTurns(session),
    ...detectGhostReads(session),
  ];

  const wastedTotal = findings.reduce((s, f) => s + (f.wastedTokens ?? 0), 0);
  const billable =
    session.totals.inputTokens +
    session.totals.cacheCreationTokens +
    session.totals.outputTokens;
  const denom = Math.max(billable, 1);
  const wasteScore = Math.min(100, Math.round((wastedTotal / denom) * 100));

  return { session, findings, wasteScore };
}
