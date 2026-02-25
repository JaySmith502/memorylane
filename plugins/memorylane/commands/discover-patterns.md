---
allowed-tools: mcp__memorylane__browse_timeline, mcp__memorylane__search_context, mcp__memorylane__get_activity_details
description: Discover repeated workflow patterns from screen activity and suggest automations
---

# Discover Patterns

Mine the user's screen activity for repeated workflows — the kind worth automating. This command does its own pattern detection by scanning timeline data directly.

## Instructions

### Step 1 — Scan Day by Day

Pattern detection requires **sequential context** — the order of app switches within a day reveals the loops.

Iterate backwards, one day at a time:

1. `browse_timeline(startTime="today", endTime="now", limit=200, sampling="uniform")`
2. `browse_timeline(startTime="2 days ago", endTime="1 day ago", limit=200, sampling="uniform")`
3. Continue for at least 7 days.
4. If < 10 total activities after 7 days, extend to 14 days.
5. If < 5 total activities after 14 days, tell the user there isn't enough data yet. Stop.

After each day's scan, run Step 2 on that batch before moving to the next day.

### Step 2 — Identify Candidates

For each day's batch, look for **goal-directed sequences** — multi-step workflows where someone is trying to accomplish a specific outcome:

| Signal                   | Example                                           | What it suggests       |
| ------------------------ | ------------------------------------------------- | ---------------------- |
| **App-switching loops**  | Chrome → Notion → Chrome → Notion                 | "Test and record" loop |
| **Semantic repetition**  | "Reviewing model X", then "Reviewing model Y"     | Evaluation loop        |
| **Cross-day recurrence** | Same workflow appearing Monday, Wednesday, Friday | Established process    |
| **Multi-step pipelines** | GitHub → Cursor → Terminal → GitHub, consistently | End-to-end workflow    |

Maintain a running candidate list across all days. A pattern spotted on multiple days is stronger evidence — merge duplicates and increase confidence.

**Noise to ignore:**

- One-off occurrences (must appear **3+ times** to report)
- Background app switches (email, Slack, Reddit)
- Overly broad patterns — "uses Cursor and Chrome" is useless
- Trivial sequences — a 2-step process done twice isn't worth documenting

### Step 3 — Confirm Top Candidates

For each candidate with 3+ occurrences:

1. `search_context(query)` — widen to 30 days to verify the pattern holds beyond the scan window.
2. `get_activity_details(ids)` — only for high-confidence candidates where OCR text would reveal automation-relevant specifics (URLs, field names, data being moved). Keep to a minimum.

### Step 4 — Present Ranked Results

Present patterns as a numbered list, ranked by automation impact (frequency × estimated time per loop × ease of automation). For each pattern:

```
**N. [Pattern Name]**
- **What it does**: [1-2 sentence description of the end-to-end process]
- **Frequency**: [count] occurrences over [time span]
- **Confidence**: [high/medium/low]
- **Apps involved**: [list of apps]
- **Loop structure**: [e.g., "Email → CRM → Billing → Email"]
- **What varies**: [parameters that change each run]
- **What's constant**: [fixed elements — URLs, templates, sequences]
- **Automation idea**: [concrete suggestion for how to automate]
```

After the list, show a summary:

```
**Total**: X patterns found. Estimated Y hours/week savings if all were automated.
```

### Step 5 — Let User Select

Ask the user which pattern(s) they'd like to turn into automation runbooks. Mention they can use `/create-runbook` to generate a detailed step-by-step runbook file from any pattern they choose.

## Notes

- **Summaries are the primary source of truth.** Reserve `get_activity_details` for high-confidence candidates only.
- **Privacy** — never reproduce raw OCR (passwords, API keys, personal messages) in the output.
- **Granularity sweet spot** — specific enough to write an automation for, general enough to be a repeatable process. "Writes code in Cursor" is too broad. "Edits hero.tsx → Chrome preview → CSS tweak → preview again" is just right.
