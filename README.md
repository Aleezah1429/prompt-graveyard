# 💀 Prompt Graveyard

**Postmortem analysis for Claude Code sessions.**

Token trackers tell you *how much* you spent. Prompt Graveyard tells you *what was wasted* — duplicate file reads, repeated shell commands, cache rebuilds, and "ghost reads" (content loaded but never used) — and estimates the dollar cost of that waste against Anthropic's public pricing.

100% local. No API calls. No upload. Reads `~/.claude/projects/*/[session].jsonl` directly.

[![npm version](https://img.shields.io/npm/v/prompt-graveyard.svg)](https://www.npmjs.com/package/prompt-graveyard)
[![license](https://img.shields.io/npm/l/prompt-graveyard.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/prompt-graveyard.svg)](https://nodejs.org)

---

## Why this exists

A growing ecosystem of tools tracks **how much** you spend on Claude Code (`ccusage`, `tokscale`, status-line widgets, etc.). None of them tell you **what was wasted**:

- Which file did Claude re-read four times?
- Which prompt produced 38k tokens of context but zero output?
- When did the prompt cache invalidate, and why?
- Which tool result was loaded but never actually used?
- How many dollars of that session went to waste?

Prompt Graveyard answers those questions. It's a diagnostic, not a meter.

---

## Install

Requires Node.js 18+.

### Run without installing (recommended)

```bash
npx prompt-graveyard sweep -n 5
```

`npx` downloads the package on the fly and runs it. Nothing is left behind globally.

### Install globally

```bash
npm install -g prompt-graveyard
prompt-graveyard sweep -n 5
```

### From source

```bash
git clone https://github.com/Aleezah1429/prompt-graveyard
cd prompt-graveyard
npm install
npm run build
node bin/prompt-graveyard.js sweep -n 5
```

---

## Quick start

Three commands cover most use cases.

### 1. Analyze the latest session for a project

Point the CLI at a project directory and it analyzes that project's most recent Claude Code session:

```bash
prompt-graveyard --cwd /path/to/your/project
```

Or, if your shell is already in the project directory:

```bash
prompt-graveyard
```

Sample output:

```
💀 Prompt Graveyard
────────────────────────────────────────────────────────────
Session    8017d76d-ef6e-4b4d-8529-6b11c1297518
Project    /path/to/your/project
Branch     main
Models     claude-opus-4-7
Turns      292
Started    2026-04-26T13:45:30.487Z

┌──────────────────┬────────────┐
│ Token type       │      Count │
├──────────────────┼────────────┤
│ Input (uncached) │        338 │
│ Cache creation   │    493,368 │
│ Cache read       │ 14,308,151 │
│ Output           │    172,153 │
│ Total            │ 14,974,010 │
└──────────────────┴────────────┘

API cost    $43.63  (at public pay-as-you-go rates; Pro/Max subs absorb this)
Waste score 25/100  ~$3.14 of API-equivalent cost likely wasted

▸ token-spike  (3)
  [HIGH] Cache rebuild on turn 116: 55,848 tokens written
  ...
```

Sessions with detected waste show findings grouped by detector (`duplicate-reads`, `duplicate-bash`, `ghost-read`, `token-spike`, `low-output-turn`).

### 2. Generate an HTML report

```bash
prompt-graveyard --cwd /path/to/your/project --html ./report.html
open ./report.html
```

The HTML report is a self-contained, dark-themed dashboard:

- A color-coded waste-score badge (green / yellow / red)
- Token breakdown with API-equivalent cost
- A per-turn token timeline — every turn rendered as a stacked bar (cache read = grey, cache create = orange, input = blue, output = green); flagged turns are ringed in red
- All findings grouped by detector with severity badges

The file has no external CSS, JS, or network calls — email it, commit it, or open it offline.

### 3. Rank the worst sessions across all your projects

```bash
prompt-graveyard sweep -n 10
```

Scans every Claude Code session under `~/.claude/projects/` and prints a leaderboard:

```
💀 Prompt Graveyard — Sweep
Worst sessions across all projects (10 shown)
┌───┬───────┬───────┬────────┬──────────┬──────────────────────────────┬──────────────────────────────────┐
│ # │ Score │ Turns │  API $ │ Wasted $ │ Project                      │ Top finding                      │
├───┼───────┼───────┼────────┼──────────┼──────────────────────────────┼──────────────────────────────────┤
│ 1 │   100 │ 1,038 │   $274 │   $69.55 │ …Frontend                    │ Turn 1011: 318k in, 2 out        │
│ 2 │   100 │   551 │   $108 │   $34.68 │ …web-vitals-checker          │ Cache rebuild: 217k tokens       │
│ 3 │    56 │   493 │   $106 │   $19.10 │ …habit-flow                  │ Cache rebuild: 158k tokens       │
└───┴───────┴───────┴────────┴──────────┴──────────────────────────────┴──────────────────────────────────┘
Totals (at public API rates, not what you paid on subscription): $488 · $123 estimated waste
```

Pick the worst row, then run the HTML report on that specific session for a deep dive.

---

## All commands

```bash
# Analyze the latest session for the current directory's project
prompt-graveyard

# Analyze the latest session for an arbitrary project directory
prompt-graveyard --cwd /path/to/your/project

# Analyze a specific session file directly
prompt-graveyard ~/.claude/projects/-Users-you-myproject/SESSION_ID.jsonl

# HTML report
prompt-graveyard --cwd /path/to/your/project --html ./report.html

# Sweep — leaderboard across all projects
prompt-graveyard sweep -n 20 --min-turns 5

# List recent sessions for a project (newest first)
prompt-graveyard list --cwd /path/to/your/project -n 10

# JSON output, pipe to jq for filtering
prompt-graveyard --cwd /path/to/your/project --json | jq '.findings[] | select(.severity == "high")'
```

Run `prompt-graveyard --help` for the full flag list.

---

## What it detects

| Detector          | What it flags                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `duplicate-reads` | Same file `Read` across multiple turns. After the first read the file content sits in conversation; re-reads bloat context.  |
| `duplicate-bash`  | Identical `Bash` command run more than once.                                                                                  |
| `token-spike`     | A turn that wrote ≥20k cache-creation tokens — the prefix changed enough to invalidate the cache. Frequent rebuilds compound. |
| `low-output-turn` | Heavy context loaded, almost no output, no tool calls. Often a sign of an unclear prompt or premature thinking.               |
| `ghost-read`      | Tool result was sizeable but its distinctive content barely surfaced in later turns. Likely loaded but unused.                |

---

## Cost estimation

> **About the dollar figures.** They're **API-equivalent cost** — what the session would have cost on Anthropic's public pay-as-you-go API. If you're on a Claude Code Pro or Max subscription, your actual out-of-pocket is the flat monthly fee; the subscription absorbs all of this. A `$69 wasted` number does **not** mean you were charged $69 — it means the equivalent API run would have, and a session that wasteful is eating into your subscription's rate-limit allowance.

Each session is priced against Anthropic's published per-model rates (Opus, Sonnet, Haiku), with cache-write at 1.25× input and cache-read at 0.1× input. The model is read straight from the transcript, so a session that mixed Opus and Sonnet is priced correctly per turn.

The `~$X likely wasted` figure under the waste score is an estimate: each finding's `wastedTokens` priced at the relevant turn's cache-write rate (most waste is cache rebuild). Treat it as a lower-bound for napkin math, not an invoice.

---

## Waste score

A 0–100 number computed as `wasted tokens / billable tokens`, where `billable = input + cache_creation + output`. Cache reads are excluded since they're roughly 10× cheaper.

| Score   | Meaning                          |
| ------- | -------------------------------- |
| 0–14    | Clean session                    |
| 15–29   | Some waste, worth a glance       |
| 30–69   | Meaningful waste                 |
| 70–100  | Investigate this session         |

---

## Privacy

Everything runs locally. Your transcripts never leave your machine. There are zero network calls.

You can verify this yourself:

```bash
grep -RE '(fetch|http|axios|got)\b' src/
```

The only matches are inside string detectors that look for tool names like `WebFetch` in your transcripts — not actual network calls.

---

## Development

```bash
git clone https://github.com/Aleezah1429/prompt-graveyard
cd prompt-graveyard
npm install
npm run build      # one-shot compile
npm run dev        # watch mode
```

Compiled output goes to `dist/`. The CLI entry point is `bin/prompt-graveyard.js`, which loads `dist/cli.js`.

---

## Contributing

Issues and PRs welcome. If you have a Claude Code session that produced a waste pattern Prompt Graveyard didn't catch, please open an issue with the (sanitized) finding — that's the most valuable contribution right now.

---

## License

[MIT](./LICENSE)
