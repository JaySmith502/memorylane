---
name: pattern-detector
description: Analyze MemoryLane activity data to detect repeated workflow patterns and suggest automations. Use when the user asks about their habits, recurring workflows, automatable tasks, or when proactively reviewing activity for optimization opportunities. Requires MemoryLane MCP tools.
---

# Pattern Detector

Detect repeated workflow patterns from MemoryLane screen activity data and suggest concrete automations.

## Overview

Users accumulate thousands of screen activity records in MemoryLane — app switches, page visits, code edits, form fills. Hidden in this noise are **repeated workflow loops**: sequences of actions the user performs multiple times with slight variations. These loops are prime automation candidates.

This skill extracts those patterns, maintains a persistent memory of known patterns, and generates actionable automation suggestions.

## When to Use

- User asks: "what do I keep doing?", "find automatable tasks", "what are my patterns?"
- User asks: "what did I spend time on?" and wants optimization insights, not just a summary
- Proactive analysis: user wants periodic pattern reviews
- User references MemoryLane data and wants workflow insights

## Available MCP Tools

This skill uses the following MemoryLane MCP tools:

### Data Gathering Tools

- **`memorylane:browse_timeline`** — List activity during a time period with sampling. Best for broad "what did I do?" questions. Returns compact one-line summaries.

  ```
  browse_timeline(startTime="7 days ago", endTime="now", limit=50, sampling="uniform")
  ```

- **`memorylane:search_context`** — Semantic search over recorded screen activity. Returns id, time, app, and AI summary for each result. Use for targeted queries like "when did I review PR #142?".

  ```
  search_context(query="[pattern-specific query]", startTime="30 days ago", endTime="now", limit=20)
  ```

- **`memorylane:get_activity_details`** — Fetch full activity details by ID, including raw OCR screen text. Use after browse_timeline or search_context when exact on-screen text is needed.
  ```
  get_activity_details(ids=["id1", "id2", "id3"])
  ```

### Pattern Tools

- **`memorylane:list_patterns`** — List all detected workflow patterns with stats (sighting count, last seen, confidence). Ordered by frequency. Always call this first to see what patterns already exist.

- **`memorylane:search_patterns`** — Search detected workflow patterns by keyword against name, description, and associated apps. Use to check if a candidate pattern already exists before creating new analysis.

- **`memorylane:get_pattern_details`** — Fetch a specific pattern by ID with full details and recent sightings including evidence and confidence scores.

## Workflow

### Step 1: Check Existing Patterns

Always start by checking what patterns have already been detected:

```
list_patterns()
```

If patterns exist, fetch details on the most relevant ones using `get_pattern_details`. Use `search_patterns` if the user is asking about a specific type of workflow.

### Step 2: Gather Raw Activity Data

Start broad, then drill in. Use a timeline scan to understand the scope.

```
browse_timeline(startTime="7 days ago", endTime="now", limit=50, sampling="uniform")
```

50 entries across 7 days is a good starting density. For intra-day pattern detection, use a tighter window:

```
browse_timeline(startTime="4 hours ago", endTime="now", limit=50, sampling="uniform")
```

### Step 3: Identify Candidate Patterns

From the timeline results, look for these signals:

**App-switching loops**: The same sequence of apps appearing repeatedly. Example:

- Chrome (OpenRouter) → Notion → Chrome (OpenRouter) → Notion
- This suggests a "test and record" loop.

**Semantic repetition**: Multiple activity summaries describing the same action with different subjects. Example:

- "Reviewing model X on OpenRouter"
- "Reviewing model Y on OpenRouter"
- This suggests a "comparison/evaluation" loop.

**Cross-day recurrence**: The same activity type appearing on multiple different days.

**Multi-step workflows**: A consistent sequence of different actions forming a pipeline.

### Step 4: Deep-Dive on Candidates

For each candidate pattern, use targeted searches to confirm and enrich:

```
search_context(query="[pattern-specific query]", startTime="30 days ago", endTime="now", limit=20)
```

For high-confidence patterns, fetch full details:

```
get_activity_details(ids=["id1", "id2", "id3"])
```

The OCR text reveals what was actually on screen — crucial for generating specific automation suggestions.

### Step 5: Classify Each Pattern

| Type                     | Description                                               | Automation Approach                                         |
| ------------------------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| **Evaluation loop**      | Testing/comparing multiple options with the same criteria | Batch script that runs all options and generates comparison |
| **Monitoring check**     | Periodically checking a dashboard or status page          | Scheduled alert/digest that only notifies on changes        |
| **Data pipeline**        | Multi-step process moving data between tools              | End-to-end workflow automation (n8n, script, API chain)     |
| **Iterative refinement** | Repeated small edits with preview cycles                  | Better tooling, hot reload, design tokens, templates        |
| **Manual data entry**    | Copying information between apps/screens                  | API integration or sync between the tools                   |
| **Research gathering**   | Visiting multiple sources to collect related info         | Aggregation script or custom dashboard                      |

### Step 6: Present Results as HTML

**CRITICAL**: The final output MUST be rendered as inline HTML. Use the HTML template below, filling in the detected patterns. The HTML is self-contained with inline styles so it renders well in chat.

Rank patterns by **automation impact** — a function of frequency, time per loop, and automation ease.

## HTML Output Template

Output this HTML directly in your response, substituting the placeholder values with real data. Repeat the `<!-- PATTERN CARD -->` block for each detected pattern. Remove placeholder comments.

```html
<div
  style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; color: #1a1a2e;"
>
  <!-- HEADER -->
  <div
    style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px; padding: 24px 28px; margin-bottom: 24px; color: white;"
  >
    <div style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">Pattern Report</div>
    <div style="font-size: 13px; opacity: 0.85;">
      {analysis_window} · {total_activities_analyzed} activities analyzed · {pattern_count} patterns
      found
    </div>
  </div>

  <!-- PATTERN CARD — repeat for each pattern -->
  <div
    style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px 24px; margin-bottom: 16px; background: #fff;"
  >
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
      <span
        style="background: {type_color}; color: white; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;"
        >{pattern_type}</span
      >
      <span style="font-size: 16px; font-weight: 600; color: #1a1a2e;">{pattern_name}</span>
    </div>
    <div style="font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 14px;">
      {description}
    </div>

    <!-- STATS ROW -->
    <div style="display: flex; gap: 24px; margin-bottom: 14px; flex-wrap: wrap;">
      <div>
        <div
          style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;"
        >
          Frequency
        </div>
        <div style="font-size: 14px; font-weight: 600; color: #1e293b;">{frequency}</div>
      </div>
      <div>
        <div
          style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;"
        >
          Time per loop
        </div>
        <div style="font-size: 14px; font-weight: 600; color: #1e293b;">{time_per_loop}</div>
      </div>
      <div>
        <div
          style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;"
        >
          Apps
        </div>
        <div style="font-size: 14px; font-weight: 600; color: #1e293b;">{apps_involved}</div>
      </div>
      <div>
        <div
          style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;"
        >
          Effort to automate
        </div>
        <div style="font-size: 14px; font-weight: 600; color: {effort_color};">{effort}</div>
      </div>
    </div>

    <!-- LOOP STRUCTURE -->
    <div style="background: #f8fafc; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px;">
      <div
        style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;"
      >
        Loop structure
      </div>
      <div
        style="font-size: 13px; color: #334155; font-family: 'SF Mono', Monaco, Consolas, monospace;"
      >
        {loop_structure}
      </div>
    </div>

    <!-- WHAT VARIES vs WHAT'S CONSTANT -->
    <div style="display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap;">
      <div
        style="flex: 1; min-width: 200px; background: #fef3c7; border-radius: 8px; padding: 12px 16px;"
      >
        <div
          style="font-size: 11px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;"
        >
          What varies
        </div>
        <div style="font-size: 13px; color: #78350f;">{what_varies}</div>
      </div>
      <div
        style="flex: 1; min-width: 200px; background: #d1fae5; border-radius: 8px; padding: 12px 16px;"
      >
        <div
          style="font-size: 11px; color: #065f46; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;"
        >
          What's constant
        </div>
        <div style="font-size: 13px; color: #064e3b;">{what_stays_constant}</div>
      </div>
    </div>

    <!-- AUTOMATION SUGGESTION -->
    <div style="border-top: 1px solid #e2e8f0; padding-top: 14px;">
      <div style="font-size: 12px; font-weight: 600; color: #6366f1; margin-bottom: 6px;">
        Automation suggestion
      </div>
      <div style="font-size: 14px; color: #334155; line-height: 1.5;">{automation_approach}</div>
    </div>
  </div>
  <!-- END PATTERN CARD -->

  <!-- SUMMARY FOOTER -->
  <div
    style="background: #f8fafc; border-radius: 10px; padding: 16px 20px; border: 1px solid #e2e8f0;"
  >
    <div style="font-size: 13px; color: #64748b; line-height: 1.5;">
      <strong style="color: #1e293b;">Estimated total time savings:</strong> {total_time_savings}
      per week if all suggested automations are implemented.
    </div>
  </div>
</div>
```

### Type color mapping

Use these colors for the `{type_color}` placeholder based on pattern type:

| Type                 | Color                |
| -------------------- | -------------------- |
| evaluation_loop      | `#6366f1` (indigo)   |
| monitoring_check     | `#0ea5e9` (sky blue) |
| data_pipeline        | `#8b5cf6` (violet)   |
| iterative_refinement | `#f59e0b` (amber)    |
| manual_data_entry    | `#ef4444` (red)      |
| research_gathering   | `#10b981` (emerald)  |

### Effort color mapping

| Effort | Color             |
| ------ | ----------------- |
| Easy   | `#10b981` (green) |
| Medium | `#f59e0b` (amber) |
| Hard   | `#ef4444` (red)   |

## Analysis Prompt Template

When analyzing activity batches for patterns, use this internal reasoning structure:

```
I'm analyzing {N} activities from {time_range}.

STEP 1 - App frequency:
Which apps appear most? What pairs of apps appear together?

STEP 2 - Semantic clustering:
Group activities by what they describe. Are there clusters of similar descriptions?

STEP 3 - Temporal sequences:
Within each cluster, do activities follow a consistent order?

STEP 4 - Repetition detection:
For each sequence, does it repeat? How many times? Over what time span?

STEP 5 - Variation analysis:
Within repeated sequences, what changes between iterations?
What stays the same?

STEP 6 - Automation assessment:
For the "stays the same" parts — can these be scripted, scheduled, or API-driven?
```

## Important Considerations

**Noise filtering**: Not everything that repeats is a pattern worth flagging. Checking email, switching to Slack, browsing Reddit — these are background behaviors, not automatable workflows. Focus on **goal-directed sequences** where the user is trying to accomplish a specific outcome through a series of steps.

**Granularity matters**: A pattern like "writes code in Cursor" is too broad to be useful. A pattern like "edits hero.tsx, switches to Chrome to preview, switches back to Cursor, makes small CSS tweak, previews again" is specific enough to suggest better tooling.

**Don't over-suggest**: Only flag patterns where automation would genuinely save meaningful time. A 2-step process done twice isn't worth automating. An 8-step process done daily is.

**Privacy-aware**: Activity data may contain sensitive information visible in OCR text. Don't reproduce passwords, API keys, or personal messages in pattern descriptions. Summarize at the workflow level.

## Example Patterns (for calibration)

1. **Evaluation loop**: User tests 8 AI models one by one on OpenRouter, recording results in Notion after each test. → Automate with batch API script.

2. **Outreach pipeline**: User scrapes GitHub stargazers, cleans data in Sheets, imports to email tool, writes personalized emails with Claude. → Automate with end-to-end script from repo URL to campaign launch.

3. **Monitoring check**: User opens Smartlead dashboard 2-3 times per day to check campaign metrics. → Automate with scheduled digest notification.

4. **Performance debugging**: User repeatedly opens Activity Monitor to check CPU usage of their app during development. → Automate with built-in telemetry/logging.

5. **Iterative design**: User makes small CSS changes, previews in browser, adjusts, previews again, sometimes discards all changes. → Suggest component playground or hot-reload improvements.
