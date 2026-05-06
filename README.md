# 💀 Prompt Graveyard

**Postmortem analysis for Claude Code sessions.**

Token trackers tell you *how much* you spent. Prompt Graveyard tells you *what was wasted* — duplicate file reads, repeated shell commands, cache rebuilds, and "ghost reads" (content loaded but never used) — and estimates the dollar cost of that waste against Anthropic's public pricing.

100% local. No API calls. No upload. Reads `~/.claude/projects/*/[session].jsonl` directly.

[![npm version](https://img.shields.io/npm/v/prompt-graveyard.svg)](https://www.npmjs.com/package/prompt-graveyard)
[![license](https://img.shields.io/npm/l/prompt-graveyard.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/prompt-graveyard.svg)](https://nodejs.org)

---

## How it works (in one picture)

```
┌──────────────────────────────────┐    ┌─────────────────────┐    ┌────────────────────┐
│  ~/.claude/projects/             │    │   prompt-graveyard  │    │  Reports           │
│   <slug>/<session>.jsonl         │──▶ │   parser → analyzer │──▶ │  • terminal        │
│  (raw Claude Code transcripts)   │    │   7 detectors       │    │  • HTML dashboard  │
└──────────────────────────────────┘    │   pricing engine    │    │  • Markdown / PR   │
                                        └──────────┬──────────┘    │  • JSON / jq       │
                                                   │               │  • live alerts     │
                                                   ▼               └────────────────────┘
                              waste score · $ wasted · CLAUDE.md hints
```

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

Sessions with detected waste show findings grouped by detector (`duplicate-reads`, `duplicate-bash`, `ghost-read`, `token-spike`, `low-output-turn`, `thrash-loop`, `stale-CLAUDE-md`).

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

# Markdown report — paste into PR descriptions or GitHub issues
prompt-graveyard --cwd /path/to/your/project --md ./pg-report.md

# Sweep — leaderboard across all projects
prompt-graveyard sweep -n 20 --min-turns 5

# Live mode — alert as waste patterns emerge during a session
prompt-graveyard watch                       # follows the most recent session
prompt-graveyard watch -v                    # also print one line per turn

# Explain a single turn — raw prompt, tool calls, results, verdict
prompt-graveyard explain 47

# Diff two sessions side-by-side
prompt-graveyard diff sessionA.jsonl sessionB.jsonl

# CLAUDE.md improvement suggestions, generated from a real session
prompt-graveyard suggest --md             # paste-ready markdown

# Auto-run prompt-graveyard at the end of every Claude Code session
prompt-graveyard hook show                # print the settings.json snippet
prompt-graveyard hook install --out /tmp/pg-latest.md  # merge it for you

# List recent sessions for a project (newest first)
prompt-graveyard list --cwd /path/to/your/project -n 10

# JSON output, pipe to jq for filtering
prompt-graveyard --cwd /path/to/your/project --json | jq '.findings[] | select(.severity == "high")'
```

Run `prompt-graveyard --help` for the full flag list.

---

## Common workflows

### A. After a long session — what went wrong?

```
session ends ──▶ prompt-graveyard --html ./report.html ──▶ open ./report.html
                                                       └─▶ click the highest bar in the timeline
                                                       └─▶ prompt-graveyard explain <turn>
```

You don't even have to remember to run it — see [Hook integration](#hook-integration-auto-run-on-every-session-end) below to automate this completely.

---

### B. Drill into a single turn — `pg explain`

When the report flags a turn, you usually want to know *exactly* what happened on that turn — what prompt was sent, which tools were called, what came back, and which detector fired. `pg explain` gives you the full picture without piping JSON through `jq`:

```bash
prompt-graveyard explain 47
```

You get the model used, token breakdown, cost for that one turn, the message text, the thinking block, every tool call with its result, and the verdict from any detectors that flagged it.

---

### C. Share a session report on GitHub, Slack, or Notion — `--md`

**Why this exists.** The HTML report is great for a personal deep-dive, but it doesn't travel well. You can't paste an HTML file into a GitHub pull request description, a Linear ticket, a Slack message, or a Notion doc. Attaching the file forces every reviewer to download and open it before they can see anything. Most of the time, they won't.

The `--md` flag writes the same report as a single Markdown file — and Markdown renders natively almost everywhere developer conversations happen.

**Usage:**

```bash
# Generate a Markdown report for the latest session in this project
prompt-graveyard --cwd /path/to/your/project --md ./pg-report.md

# Pipe straight to clipboard (macOS) — paste directly into a PR description
prompt-graveyard --cwd /path/to/your/project --md /dev/stdout | pbcopy
```

The report contains the same information as the HTML dashboard: session metadata, token breakdown, API-equivalent cost, waste score, estimated wasted spend, and every finding grouped by detector with severity, detail, and the turns it affected.

**When to use which output format:**

| Use case                                                              | Format          |
| --------------------------------------------------------------------- | --------------- |
| Personal review — you want a clickable, visual dashboard              | `--html`        |
| PR description, GitHub issue, Slack thread, Notion / Linear / Jira    | `--md`          |
| Pipe into `jq`, dashboards, scripts, or your own tooling              | `--json`        |
| Quick read in the terminal                                            | (no flag)       |

**Previewing the Markdown locally.** A `.md` file is plain text, so you need a viewer to see it rendered. Easiest options:

```bash
# macOS — opens with whichever app is registered for .md files
# (Cursor / VS Code / Typora etc. will render it side-by-side)
open ./pg-report.md

# In an editor that's already open, press Cmd + Shift + V to toggle preview
```

If your default `.md` app is plain TextEdit, install [Cursor](https://cursor.sh) or [VS Code](https://code.visualstudio.com/) and set it as the default — both render Markdown with `Cmd + Shift + V`. Or paste the contents into a [private GitHub Gist](https://gist.github.com/) for an authentic GitHub render.

---

### D. "Did my CLAUDE.md change actually help?" — `pg diff`

You tweaked your CLAUDE.md or your prompt style, and you want to see if it actually moved the needle. Run the same task in two sessions, then diff them:

```bash
prompt-graveyard diff before.jsonl after.jsonl
```

You see a side-by-side table for both sessions: token counts, cost, waste score, detector counts, and a Δ column with absolute and percentage change. Color-coded — green if "after" is better, red if it got worse. No more guessing whether your tweaks helped.

---

### E. Get live waste alerts while you're working — `pg watch`

**Why this exists.** Every other prompt-graveyard command is a *postmortem* — you run it after a session has ended and look at what happened. That's useful, but by the time you see the report, the session is already over and the tokens are already spent. If a 200-turn session burned $40 of equivalent API cost on duplicate reads, finding out about it the next day doesn't help you avoid it.

`pg watch` flips the loop. It tails the active session file and runs the same detectors continuously, surfacing each new finding as a one-line alert the moment it appears. You can fix the underlying behaviour — a vague prompt, a missing CLAUDE.md note, a habit of re-reading files — *while the session is still running*.

**Usage:**

```bash
# Run once in a dedicated terminal at the start of your work day.
# It auto-follows whichever Claude Code session is most recently active.
prompt-graveyard watch

# Verbose mode also prints a compact one-line summary for every new turn
prompt-graveyard watch -v
```

**Sample output:**

```
💀 Prompt Graveyard — watching for waste
Project dir: /Users/you/.claude/projects/-Users-you-myproject
────────────────────────────────────────────────────────────
▸ tracking /Users/you/.claude/projects/.../d4e1ad7c.jsonl
[WARN] duplicate-reads: Read 3× redundantly: src/payments/checkout.ts
[HIGH] token-spike:    Cache rebuild on turn 47: 58,210 tokens written  (~58k tok)
[WARN] thrash-loop:    Thrash loop on src/api.ts (2× edit→read→edit)
```

**What you can act on, mid-session:**

| Alert              | Likely fix                                                                              |
| ------------------ | --------------------------------------------------------------------------------------- |
| `duplicate-reads`  | Tell Claude *"don't re-read files you've already read this session"* in the next prompt |
| `token-spike`      | Stop and investigate which file change invalidated the cache                            |
| `thrash-loop`      | Add a CLAUDE.md note: "after editing, trust the diff — don't re-read"                   |
| `ghost-read`       | Your last prompt loaded too much; narrow the scope of the next one                      |
| `stale-CLAUDE-md`  | Trim CLAUDE.md so the whole file stays cached                                           |

**Mental model.** Where `analyze` is the doctor reading your X-ray after the visit, `watch` is the fitness tracker buzzing your wrist the moment your form is off.

---

### F. Generate CLAUDE.md improvements from real evidence — `pg suggest`

Most "how to write a good CLAUDE.md" advice is generic. `pg suggest` is specific: it reads *your* session and points at *your* repeated patterns:

```bash
prompt-graveyard suggest --md > improvements.md
```

You get suggestions like:
- *"5 files were re-read multiple times — paste these paths into a 'Key files' section in CLAUDE.md."*
- *"3 shell commands ran 4+ times each — add a 'Common commands' section."*
- *"CLAUDE.md was re-read on turns 14, 38, 91 — it's probably too large to stay cached. Trim it."*

Open `improvements.md`, review, then paste the relevant bits into your project's CLAUDE.md. Evidence-driven, not guesswork.

---

## What it detects

| Detector           | What it flags                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `duplicate-reads`  | Same file `Read` across multiple turns. After the first read the file content sits in conversation; re-reads bloat context.  |
| `duplicate-bash`   | Identical `Bash` command run more than once.                                                                                  |
| `token-spike`      | A turn that wrote ≥20k cache-creation tokens — the prefix changed enough to invalidate the cache. Frequent rebuilds compound. |
| `low-output-turn`  | Heavy context loaded, almost no output, no tool calls. Often a sign of an unclear prompt or premature thinking.               |
| `ghost-read`       | Tool result was sizeable but its distinctive content barely surfaced in later turns. Likely loaded but unused.                |
| `thrash-loop`      | A file was edited → re-read → edited again. The previous edit's result was already in context; the re-read just bloats it.    |
| `stale-CLAUDE-md`  | `CLAUDE.md` itself is being re-read multiple times — either it's getting evicted (too large) or it isn't authoritative enough. |

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

## Hook integration — automate the postmortem

**Why this exists.** Every diagnostic tool eventually loses to the same problem: humans forget to run it. The fastest way to make a tool useless is to require manual effort after every Claude Code session ends. Prompt Graveyard fixes that by hooking into Claude Code's built-in `Stop` hook, so a fresh report is generated automatically the moment any session ends — across every project, with no further action from you.

Under the hood, this writes a small entry to `~/.claude/settings.json` that runs `prompt-graveyard` whenever a session terminates. The installer is **non-destructive**: it merges into any existing `hooks` configuration, detects if a prompt-graveyard hook is already present, and never overwrites unrelated keys.

### One-time setup

```bash
prompt-graveyard hook install --out /tmp/pg-latest.md
```

That's it. From now on, every Claude Code session that ends — in any project on this machine — writes a fresh Markdown report to `/tmp/pg-latest.md`. To see the latest postmortem at any time:

```bash
cat /tmp/pg-latest.md
```

Or open it in your editor. Or wire it into your shell prompt to glance at the waste score automatically.

### Configuring the output

| Flag              | What it does                                                                       |
| ----------------- | ---------------------------------------------------------------------------------- |
| `--out <path>`    | File path where each session's report should be written. Default: `/tmp/pg-latest.md` |
| `--format md`     | Markdown output (default — readable, paste-able)                                   |
| `--format html`   | Self-contained HTML dashboard                                                      |
| `--format terminal` | Plain text, for shell-prompt integrations                                        |
| `--bin <path>`    | Override which prompt-graveyard binary the hook should call                        |

Examples:

```bash
# HTML dashboard auto-generated after every session
prompt-graveyard hook install --format html --out /tmp/pg-latest.html

# Per-user file, picked up by your shell prompt
prompt-graveyard hook install --out ~/.cache/pg-latest.md
```

### Preview without installing

```bash
prompt-graveyard hook show
# prints the exact JSON snippet that would be added to ~/.claude/settings.json
```

Use this if you'd rather edit the file yourself, or if you want to commit a team-shared hook configuration to source control.

### Remove later

```bash
prompt-graveyard hook uninstall
```

This removes only the prompt-graveyard entry from the `Stop` hook list. Any other hooks you've configured are left exactly as they were.

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
