import { readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseSession } from "./parser.js";
import { analyze } from "./detectors/index.js";
import type { Report } from "./types.js";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

export interface SweepRow {
  projectSlug: string;
  cwd: string;
  sessionFile: string;
  modifiedAt: string;
  turns: number;
  totalTokens: number;
  billableTokens: number;
  wasteScore: number;
  costUsd: number;
  wastedCostUsd: number;
  topFinding?: string;
  findingCount: number;
}

function projectCwdFromSlug(slug: string): string {
  return slug.startsWith("-") ? slug.replace(/-/g, "/") : slug;
}

export interface SweepOptions {
  limit?: number;
  minTurns?: number;
  onProgress?: (current: number, total: number) => void;
}

export function sweep(opts: SweepOptions = {}): SweepRow[] {
  if (!existsSync(PROJECTS_DIR)) return [];

  const minTurns = opts.minTurns ?? 5;
  const projectDirs = readdirSync(PROJECTS_DIR)
    .map((name) => join(PROJECTS_DIR, name))
    .filter((p) => statSync(p).isDirectory());

  const allFiles: { dir: string; slug: string; file: string }[] = [];
  for (const dir of projectDirs) {
    const slug = dir.split("/").pop() ?? "";
    for (const file of readdirSync(dir)) {
      if (file.endsWith(".jsonl")) allFiles.push({ dir, slug, file: join(dir, file) });
    }
  }

  const rows: SweepRow[] = [];
  let processed = 0;
  for (const { slug, file } of allFiles) {
    processed += 1;
    opts.onProgress?.(processed, allFiles.length);
    let report: Report;
    try {
      const session = parseSession(file);
      if (session.turns.length < minTurns) continue;
      report = analyze(session);
    } catch {
      continue;
    }
    const billable =
      report.session.totals.inputTokens +
      report.session.totals.cacheCreationTokens +
      report.session.totals.outputTokens;
    const top = [...report.findings]
      .sort((a, b) => (b.wastedTokens ?? 0) - (a.wastedTokens ?? 0))[0];
    rows.push({
      projectSlug: slug,
      cwd: report.session.cwd || projectCwdFromSlug(slug),
      sessionFile: file,
      modifiedAt: new Date(statSync(file).mtimeMs).toISOString(),
      turns: report.session.turns.length,
      totalTokens: report.session.totals.grandTotal,
      billableTokens: billable,
      wasteScore: report.wasteScore,
      costUsd: report.session.totals.costUsd,
      wastedCostUsd: report.wastedCostUsd,
      topFinding: top?.title,
      findingCount: report.findings.length,
    });
  }

  rows.sort((a, b) => b.wastedCostUsd - a.wastedCostUsd || b.wasteScore - a.wasteScore);
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}
