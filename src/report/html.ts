import type { Report, Finding, Turn } from "../types.js";
import { formatUsd } from "../pricing.js";

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function turnTokens(turn: Turn): { input: number; cacheCreate: number; cacheRead: number; output: number } {
  const u = turn.usage ?? {};
  return {
    input: u.input_tokens ?? 0,
    cacheCreate: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
  };
}

function turnTotal(turn: Turn): number {
  const t = turnTokens(turn);
  return t.input + t.cacheCreate + t.cacheRead + t.output;
}

function timelineSvg(report: Report): string {
  const turns = report.session.turns;
  if (turns.length === 0) return "";
  const W = 1100;
  const H = 200;
  const PAD = 30;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const max = Math.max(...turns.map(turnTotal), 1);
  const barW = Math.max(1, innerW / turns.length - 1);

  const flagged = new Set<number>();
  for (const f of report.findings) for (const idx of f.turnIndices) flagged.add(idx);

  const bars = turns
    .map((t, i) => {
      const tk = turnTokens(t);
      const total = turnTotal(t);
      const h = (total / max) * innerH;
      const x = PAD + i * (innerW / turns.length);
      const y = PAD + (innerH - h);
      const isFlagged = flagged.has(i);

      const segments: string[] = [];
      let cursorY = y;
      const order = [
        { v: tk.cacheRead, color: "#cbd5e1" },
        { v: tk.cacheCreate, color: "#fb923c" },
        { v: tk.input, color: "#7dd3fc" },
        { v: tk.output, color: "#34d399" },
      ];
      for (const seg of order) {
        if (seg.v <= 0) continue;
        const segH = (seg.v / max) * innerH;
        segments.push(
          `<rect x="${x.toFixed(1)}" y="${cursorY.toFixed(1)}" width="${barW.toFixed(1)}" height="${segH.toFixed(
            2
          )}" fill="${seg.color}" />`
        );
        cursorY += segH;
      }
      const ring = isFlagged
        ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(
            2
          )}" fill="none" stroke="#dc2626" stroke-width="1.5" />`
        : "";
      const tooltip = `<title>Turn ${i} — ${fmt(total)} tokens (${t.role})${
        isFlagged ? " ⚠️ flagged" : ""
      }</title>`;
      return `<g>${tooltip}${segments.join("")}${ring}</g>`;
    })
    .join("");

  return `
<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:240px">
  <rect x="0" y="0" width="${W}" height="${H}" fill="#0f172a"/>
  <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="#334155"/>
  ${bars}
  <text x="${PAD}" y="20" fill="#94a3b8" font-size="11" font-family="monospace">tokens per turn (max ${fmt(
    max
  )})</text>
</svg>`;
}

function findingsHtml(findings: Finding[]): string {
  if (findings.length === 0) {
    return `<p class="empty">No waste patterns detected. ${"&#x1F389;"}</p>`;
  }
  const grouped = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = grouped.get(f.detector) ?? [];
    arr.push(f);
    grouped.set(f.detector, arr);
  }
  const sections: string[] = [];
  for (const [detector, items] of grouped) {
    const rows = items
      .map((f) => {
        const sevClass = `sev-${f.severity}`;
        const turns = f.turnIndices.map((i) => `<span class="turn-pill">${i}</span>`).join(" ");
        const wasted = f.wastedTokens ? `<div class="meta">~${fmt(f.wastedTokens)} tokens implicated</div>` : "";
        return `<li class="finding ${sevClass}">
        <div class="badge">${f.severity.toUpperCase()}</div>
        <div class="body">
          <div class="title">${escape(f.title)}</div>
          <div class="detail">${escape(f.detail)}</div>
          ${wasted}
          <div class="turns">turns: ${turns}</div>
        </div>
      </li>`;
      })
      .join("");
    sections.push(`<section class="detector">
      <h3>${escape(detector)} <span class="count">(${items.length})</span></h3>
      <ul>${rows}</ul>
    </section>`);
  }
  return sections.join("\n");
}

function scoreClass(score: number): string {
  if (score >= 30) return "score-high";
  if (score >= 15) return "score-mid";
  return "score-low";
}

export function renderHtml(report: Report): string {
  const { session, findings, wasteScore, wastedCostUsd } = report;
  const totals = session.totals;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Prompt Graveyard — ${escape(session.sessionId.slice(0, 8))}</title>
<style>
  :root {
    --bg: #0b1220;
    --card: #111827;
    --line: #1f2937;
    --text: #e5e7eb;
    --muted: #94a3b8;
    --accent: #c084fc;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    line-height: 1.5;
  }
  .container { max-width: 1180px; margin: 0 auto; padding: 32px 24px; }
  header h1 { font-size: 28px; margin: 0 0 4px; color: var(--accent); }
  header .sub { color: var(--muted); font-size: 14px; margin-bottom: 24px; font-family: monospace; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 16px;
  }
  .card h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 12px; }
  .stat { font-size: 24px; font-family: monospace; }
  table { width: 100%; border-collapse: collapse; font-family: monospace; font-size: 13px; }
  td, th { padding: 4px 8px; text-align: left; }
  td:last-child, th:last-child { text-align: right; }
  tr + tr td { border-top: 1px solid var(--line); }
  .score { font-size: 56px; font-weight: 700; font-family: monospace; line-height: 1; }
  .score-low { color: #34d399; }
  .score-mid { color: #fbbf24; }
  .score-high { color: #f87171; }
  .legend { font-size: 12px; color: var(--muted); display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; }
  .legend span::before { content: ""; display: inline-block; width: 10px; height: 10px; margin-right: 5px; border-radius: 2px; vertical-align: middle; }
  .legend .l-cr::before { background: #cbd5e1; }
  .legend .l-cc::before { background: #fb923c; }
  .legend .l-in::before { background: #7dd3fc; }
  .legend .l-out::before { background: #34d399; }
  .legend .l-flag::before { background: transparent; border: 1.5px solid #dc2626; }
  .detector { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
  .detector h3 { margin: 0 0 12px; color: var(--accent); font-size: 16px; font-family: monospace; }
  .detector h3 .count { color: var(--muted); font-weight: normal; font-size: 13px; }
  .detector ul { list-style: none; padding: 0; margin: 0; }
  .finding { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
  .finding:first-child { border-top: none; }
  .badge {
    flex: 0 0 auto;
    align-self: flex-start;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-family: monospace;
    font-weight: 700;
  }
  .sev-high .badge { background: #7f1d1d; color: #fecaca; }
  .sev-warn .badge { background: #78350f; color: #fed7aa; }
  .sev-info .badge { background: #1e3a8a; color: #bfdbfe; }
  .body { flex: 1; min-width: 0; }
  .title { font-family: monospace; font-size: 13px; word-break: break-word; }
  .detail { color: var(--muted); font-size: 13px; margin-top: 2px; }
  .meta { color: var(--muted); font-size: 12px; margin-top: 4px; font-style: italic; }
  .turns { font-size: 11px; color: var(--muted); margin-top: 6px; font-family: monospace; }
  .turn-pill { display: inline-block; background: #1f2937; padding: 1px 6px; margin: 1px 2px; border-radius: 4px; }
  .empty { color: var(--muted); padding: 24px; text-align: center; background: var(--card); border-radius: 8px; }
</style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${"&#x1F480;"} Prompt Graveyard</h1>
      <div class="sub">${escape(session.cwd)} · ${escape(session.gitBranch ?? "")} · ${escape(
    session.sessionId
  )}${session.models.length > 0 ? ` · ${escape(session.models.join(", "))}` : ""}</div>
    </header>

    <div class="grid">
      <div class="card">
        <h2>Token breakdown</h2>
        <table>
          <tr><td>Input (uncached)</td><td>${fmt(totals.inputTokens)}</td></tr>
          <tr><td>Cache creation</td><td>${fmt(totals.cacheCreationTokens)}</td></tr>
          <tr><td>Cache read</td><td>${fmt(totals.cacheReadTokens)}</td></tr>
          <tr><td>Output</td><td>${fmt(totals.outputTokens)}</td></tr>
          <tr><td><strong>Total</strong></td><td><strong>${fmt(totals.grandTotal)}</strong></td></tr>
          <tr><td><strong>API-equivalent cost</strong></td><td><strong>${formatUsd(totals.costUsd)}</strong></td></tr>
        </table>
        <div class="meta" style="margin-top:8px">at Anthropic's public pay-as-you-go rates. Claude Code Pro/Max subscriptions absorb this — your actual out-of-pocket is the flat sub fee.</div>
      </div>
      <div class="card">
        <h2>Waste score</h2>
        <div class="score ${scoreClass(wasteScore)}">${wasteScore}<span style="font-size:24px;color:var(--muted)">/100</span></div>
        <div class="meta">${session.turns.length} turns · started ${escape(session.startedAt)}</div>
        <div class="meta" style="margin-top:8px;font-style:normal;color:#f87171">~${formatUsd(wastedCostUsd)} of API-equivalent cost likely wasted</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px">
      <h2>Per-turn token timeline</h2>
      ${timelineSvg(report)}
      <div class="legend">
        <span class="l-cr">cache read</span>
        <span class="l-cc">cache create</span>
        <span class="l-in">input</span>
        <span class="l-out">output</span>
        <span class="l-flag">flagged turn</span>
      </div>
    </div>

    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:12px">Findings</h2>
    ${findingsHtml(findings)}

    <footer style="color:var(--muted);font-size:12px;margin-top:32px;text-align:center">
      Generated by prompt-graveyard
    </footer>
  </div>
</body>
</html>`;
}
