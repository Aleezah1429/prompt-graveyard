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

```bash
# from npm (recommended)
npm install -g prompt-graveyard

# or from source
git clone https://github.com/<your-handle>/prompt-graveyard
cd prompt-graveyard
npm install
npm run build
npm link
```

Requires Node.js 18+.

---

## Usage

### Analyze the latest session in your current project

```bash
cd /path/to/your/project
prompt-graveyard
```

### Generate a self-contained HTML report

```bash
prompt-graveyard --html ./report.html
open ./report.html
```

The HTML report includes:
- Token breakdown table
- Color-coded waste score
- Per-turn stacked-bar timeline (flagged turns ringed in red)
- All findings grouped by detector with severity badges

### Sweep — rank the worst sessions across **all** your projects

```bash
prompt-graveyard sweep            # top 20
prompt-graveyard sweep -n 50      # top 50
prompt-graveyard sweep --json     # raw JSON
```

### List recent sessions for a project

```bash
prompt-graveyard list -n 10
```

### Pipe findings to jq

```bash
prompt-graveyard --json | jq '.findings[] | select(.severity == "high")'
```

---

## What it detects

| Detector | What it flags |
|----------|---------------|
| `duplicate-reads` | Same file Read across multiple turns. After the first read it sits in conversation; re-reads bloat context. |
| `duplicate-bash` | Identical Bash command run more than once. |
| `token-spike` | A turn that wrote ≥20k cache_creation tokens — the prefix changed enough to invalidate the cache. Frequent rebuilds compound. |
| `low-output-turn` | Heavy context loaded, almost no output, no tool calls. Often unclear prompts. |
| `ghost-read` | Tool result was sizeable but its distinctive content barely surfaced in later turns. Likely loaded but unused. |

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
