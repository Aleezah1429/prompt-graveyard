# 💀 Prompt Graveyard

**Postmortem analysis for Claude Code sessions.**

Token trackers tell you *how much* you spent. Prompt Graveyard tells you *what was wasted* — duplicate file reads, repeated shell commands, cache rebuilds, and "ghost reads" (content loaded but never used).

100% local. No API calls. No upload. Reads `~/.claude/projects/*/[session].jsonl` directly.

---

## Why this exists

There are great tools for tracking **how much** you spend on Claude Code (`ccusage`, `tokscale`, `claude-usage`, status-line widgets…). None of them tell you **what was wasted**:

- Which file did Claude re-read 4 times?
- Which prompt produced 38k tokens of context but zero output?
- When did the prompt cache invalidate, and why?
- Which tool result was loaded but never actually used?

Prompt Graveyard answers those questions. It's a diagnostic, not a meter.

---

## Install

> Not yet published to npm. For now, install from source.

Requires Node.js 18+.

```bash
git clone https://github.com/<your-handle>/prompt-graveyard
cd prompt-graveyard
npm install         # install dependencies (one time)
npm run build       # compile TypeScript → JavaScript (re-run after any code change)
```

After `npm run build` succeeds, a `dist/` folder is created with the compiled JavaScript that the CLI runs.

---

## Quick test

To make sure everything is working, run this from inside the repo:

```bash
node bin/prompt-graveyard.js sweep -n 5
```

It will scan **all** Claude Code sessions on your machine and print the 5 worst ones. If you see a table with project names and scores, the install is good.

---

## How to run it — three ways

### 1. Terminal report for the latest session in a project

This is the most common case. Point the CLI at any project directory and it analyzes its most recent Claude Code session.

```bash
node bin/prompt-graveyard.js --cwd /path/to/your/project
```

You'll see something like:

```
💀 Prompt Graveyard
────────────────────────────────────────────────────────────
Session    8017d76d-ef6e-4b4d-8529-6b11c1297518
Project    /path/to/your/project
Branch     main
Turns      3
Started    2026-05-02T18:47:12.019Z

┌──────────────────┬────────┐
│ Token type       │  Count │
├──────────────────┼────────┤
│ Input (uncached) │     12 │
│ Cache creation   │ 20,766 │
│ Cache read       │ 29,658 │
│ Output           │  1,816 │
│ Total            │ 52,252 │
└──────────────────┴────────┘

Waste score 0/100  (higher = more tokens likely wasted)

No waste patterns detected. 🎉
```

If the session does have waste, you'll see findings grouped by detector (`duplicate-reads`, `duplicate-bash`, `ghost-read`, `token-spike`, `low-output-turn`).

### 2. HTML report (recommended for deep dives)

```bash
node bin/prompt-graveyard.js --cwd /path/to/your/project --html ./report.html
open ./report.html
```

The HTML report opens in your browser with a dark-themed dashboard:

- A big color-coded waste score badge (green / yellow / red)
- Token breakdown table
- **Per-turn timeline chart** — every turn is a stacked bar (cache read = grey, cache create = orange, input = blue, output = green); flagged turns are ringed in red
- All findings grouped by detector with severity badges

The HTML file is fully self-contained (no external CSS/JS, no network) so you can email it, commit it, or open it offline.

### 3. Sweep — rank the worst sessions across **all** your projects

```bash
node bin/prompt-graveyard.js sweep -n 10
```

It scans every Claude Code session under `~/.claude/projects/` and prints a leaderboard of the worst offenders:

```
💀 Prompt Graveyard — Sweep
Worst sessions across all projects (10 shown)
┌───┬───────┬───────┬───────────┬───────────────────────┬───────────────────────────────────┐
│ # │ Score │ Turns │  Billable │ Project               │ Top finding                       │
├───┼───────┼───────┼───────────┼───────────────────────┼───────────────────────────────────┤
│ 1 │   100 │ 1,038 │ 3,195,235 │ StudioIQ-Frontend     │ Turn 1011: 318k in, 2 out         │
│ 2 │   100 │   551 │ 1,833,304 │ web-vitals-checker    │ Cache rebuild: 217k tokens        │
│ 3 │    70 │   102 │   691,533 │ StudioIQ-Frontend     │ Cache rebuild: 115k tokens        │
└───┴───────┴───────┴───────────┴───────────────────────┴───────────────────────────────────┘
```

Useful as a starting point: pick the worst row, then run the HTML report on that specific session.

### Other commands

```bash
# list all sessions for a project, newest first
node bin/prompt-graveyard.js list --cwd /path/to/your/project -n 10

# analyze a specific session file directly
node bin/prompt-graveyard.js ~/.claude/projects/-Users-you-myproject/SESSION_ID.jsonl

# pipe findings to jq for filtering
node bin/prompt-graveyard.js --cwd /path/to/your/project --json | jq '.findings[] | select(.severity == "high")'
```

---

## Make it convenient

Typing `node /full/path/to/bin/prompt-graveyard.js` every time is tedious. Pick one:

### Option A: `npm link` (recommended)

Run this once from inside the repo:

```bash
npm link
```

Now `prompt-graveyard` works as a global command from anywhere:

```bash
cd /path/to/any/project
prompt-graveyard                       # latest session
prompt-graveyard --html report.html    # HTML report
prompt-graveyard sweep                 # leaderboard across all projects
prompt-graveyard list                  # this project's sessions
```

You may be asked for your Mac password the first time — that's normal (npm needs to write a symlink into `/usr/local/bin`).

### Option B: shell alias

If `npm link` gives you trouble, add this line to `~/.zshrc` (or `~/.bashrc`):

```bash
alias pg='node /Users/mac/Documents/Freelance/prompt-graveyard/bin/prompt-graveyard.js'
```

Then `source ~/.zshrc` (or restart the terminal). Now:

```bash
pg sweep
pg --html report.html
pg list
```

---

## After making code changes

Whenever you edit anything under `src/`, re-run the build before testing:

```bash
npm run build
```

Or run it in watch mode in a separate terminal:

```bash
npm run dev
```

This watches `src/` and rebuilds automatically on every save.

---

## What it detects


| Detector          | What it flags                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `duplicate-reads` | Same file Read across multiple turns. After the first read it sits in conversation; re-reads bloat context.                   |
| `duplicate-bash`  | Identical Bash command run more than once.                                                                                    |
| `token-spike`     | A turn that wrote ≥20k cache_creation tokens — the prefix changed enough to invalidate the cache. Frequent rebuilds compound. |
| `low-output-turn` | Heavy context loaded, almost no output, no tool calls. Often unclear prompts.                                                 |
| `ghost-read`      | Tool result was sizeable but its distinctive content barely surfaced in later turns. Likely loaded but unused.                |


---

## Waste score

A 0–100 number: `wasted tokens / billable tokens`, where billable = `input + cache_creation + output` (cache reads are excluded since they're ~10× cheaper).

- **0–14** — clean session
- **15–29** — some waste, worth a glance
- **30–69** — meaningful waste
- **70–100** — investigate this session

---

## Example output

```
💀 Prompt Graveyard
────────────────────────────────────────────────────────────
Session    dc4a736d-0d40-430f-8f7e-09395d44c983
Project    /Users/me/Documents/some-project
Branch     main
Turns      493
Started    2026-04-26T13:27:28.752Z

┌──────────────────┬────────────┐
│ Token type       │      Count │
├──────────────────┼────────────┤
│ Input (uncached) │     16,530 │
│ Cache creation   │  1,461,531 │
│ Cache read       │ 35,600,404 │
│ Output           │    337,775 │
│ Total            │ 37,416,240 │
└──────────────────┴────────────┘

Waste score 56/100  (higher = more tokens likely wasted)

▸ duplicate-reads  (2)
  [HIGH] Read 3× redundantly: /Users/me/.../components/HabitCard.tsx

▸ duplicate-bash  (4)
  [HIGH] Bash repeated 4×: npm run test:run 2>&1 | tail -10
  [HIGH] Bash repeated 3×: npx tsc --noEmit 2>&1; echo "exit: $?"

▸ token-spike  (12)
  [HIGH] Cache rebuild on turn 228: 102,934 tokens written

▸ ghost-read  (17)
  [WARN] Ghost read on turn 5: Read .../WORKFLOW.md
         11,909 bytes loaded, 7% match rate in later turns.
```

---

## Privacy

Everything runs locally. Your transcripts never leave your machine. There are zero network calls.

You can verify this yourself: `grep -RE '(fetch|http|axios|got)\b' src/` — only the `WebFetch` and `URL` tokens that appear are inside string detectors that match against tool names in your transcripts (not actual network calls).

---

## Contributing

Issues and PRs welcome. If you have a Claude Code session that produced a strange waste pattern Prompt Graveyard didn't catch, **please open an issue** with the (sanitized) finding — that's the most valuable contribution right now.

---

## License

MIT