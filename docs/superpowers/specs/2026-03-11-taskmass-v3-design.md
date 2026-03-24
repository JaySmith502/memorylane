# Taskmass v3 — Process Intelligence Agent

**Date:** 2026-03-11
**Status:** Draft
**Repo:** `C:\Users\smith\Documents\1 Projects\Taskmass`
**Reference architecture:** MemoryLane (deusXmachina-dev/memorylane)

## Purpose

Taskmass v3 is a cross-platform process intelligence agent that captures what users actually do on their computers and exposes it via MCP for AI-powered analysis. It serves two audiences:

1. **Consulting teams** — deployed to client workstations to discover automation opportunities, surface friction, and validate (or challenge) findings from facilitated workshops
2. **Power users** — engineers and AI-forward individuals who want their AI assistant to understand their workflow patterns and help them work better

Taskmass is a standalone component. Cross-referencing with other data sources (workshop transcripts, conversation mining) happens in the AI chat session, not inside Taskmass itself.

## Onboarding & Org Context

Before capture begins, Taskmass runs a guided onboarding flow that captures organizational and role context. This context is stored locally and included in MCP server instructions so the AI has business context from day one — no inference required.

### Why This Matters

Without org context, the AI must infer what the business does from raw activity data. Early inferences can be wrong ("this looks like accounting" when it's actually supply chain), and once that frame is established it colors all subsequent analysis. Providing ground truth upfront prevents the knowledge base from being tainted by presumption.

### Onboarding Flow

**Step 1 — Organization Profile** (consultant or admin fills this once per deployment):
- Organization name
- Industry / sector
- What the org produces (products, services, widgets, etc.)
- Key business processes (e.g., "order-to-cash", "procure-to-pay", "design-to-manufacture")
- Systems/tools in use (e.g., "SAP for ERP, Salesforce for CRM, Excel for reporting")

**Step 2 — User Role Profile** (each user fills on first launch):
- Name / identifier
- Department / team
- Role description (free text, e.g., "procurement specialist — handles POs and vendor management")
- Primary applications used daily
- Optional: key workflows they perform regularly

### Storage

```sql
-- Organization context (one row per deployment)
org_profile (
  id              TEXT PRIMARY KEY,
  org_name        TEXT NOT NULL,
  industry        TEXT,
  products        TEXT,               -- What they make/sell/provide
  business_processes TEXT,            -- JSON array of key process names
  systems_in_use  TEXT,               -- JSON array of tools/platforms
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
)

-- Per-user role context
user_profile (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL,
  display_name    TEXT,
  department      TEXT,
  role_description TEXT,
  primary_apps    TEXT,               -- JSON array
  key_workflows   TEXT,               -- JSON array (optional)
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
)
```

### MCP Integration

The org and user context is injected into the MCP server instructions dynamically:

```
You are connected to Taskmass for [Org Name], a [industry] organization
that [products/services description].

Key business processes: [list]
Systems in use: [list]

Current user: [name], [role] in [department].
Their primary workflows: [list]

Use this context to interpret activity patterns. When you see transitions
between [System A] and [System B], consider them in the context of
[relevant business process], not in the abstract.
```

This means every AI query — whether from the user themselves or a consultant in consultant mode — has business context without needing to ask "what does your company do?"

### Consulting Deployment

For consulting engagements:
1. The consultant fills the org profile once during setup
2. Each team member completes their user profile on first launch (takes ~2 minutes)
3. The org profile can be pre-configured and bundled with the installer so team members only need to fill their role
4. Both profiles are editable from the Settings window

### Power User Mode

Power users filling this out for themselves can keep it minimal — even just their role and primary apps helps the AI contextualize patterns significantly better than raw data alone.

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Platform Capture Layer (thin, native)      │
│  ├── Windows: Rust sidecar                  │
│  ├── macOS: Swift sidecar                   │
│  └── Captures: active window, app, URL,     │
│      timing, idle detection                 │
│      + opt-in screenshots                   │
├─────────────────────────────────────────────┤
│  TypeScript Pipeline (platform-agnostic)    │
│  ├── Activity Boundary Detection            │
│  ├── Session Management                     │
│  ├── Screenshot → OCR → LLM Summary        │
│  │   (opt-in power mode only)               │
│  └── Embedding Generation                   │
├─────────────────────────────────────────────┤
│  Storage: SQLite + FTS5 + sqlite-vec        │
│  ├── activities (core records)              │
│  ├── sessions (grouped by idle gaps)        │
│  ├── transitions (app→app sequences)        │
│  ├── patterns (detected recurring flows)    │
│  ├── tags (user/AI-applied labels)          │
│  └── embeddings (semantic vectors)          │
├─────────────────────────────────────────────┤
│  MCP Server (stdio transport)               │
│  ├── Data tools (search, timeline, details) │
│  ├── Analysis tools (friction, happy path,  │
│  │   constraints, flow issues, automation)  │
│  └── Consent-aware (scrubbed data only)     │
├─────────────────────────────────────────────┤
│  CLI (headless query interface)             │
│  ├── Query local DB without Electron        │
│  └── MCP server mode for agent pipelines    │
├─────────────────────────────────────────────┤
│  Minimal Electron UI                        │
│  ├── Onboarding (org + user profiles)       │
│  ├── Settings + capture mode toggle         │
│  ├── Privacy: app/URL exclusions            │
│  ├── Data review + scrubbing                │
│  └── MCP connection setup                   │
├─────────────────────────────────────────────┤
│  (Future) Dashboard with chat               │
│  └── Queries same storage + services layer  │
└─────────────────────────────────────────────┘
```

## Pipeline Stages

Five stages, each independently testable:

### Stage 1 — Capture (native sidecars)

Platform-specific binaries emit JSON events over stdout to the TypeScript host process.

**Event payload:**
```typescript
interface CaptureEvent {
  timestamp: number        // Unix ms
  app_name: string
  window_title: string
  url?: string             // Browser tabs
  display_id: string
  screenshot?: {
    filepath: string       // Temp PNG path
    width: number
    height: number
  }
}
```

Same interface contract on both platforms. The sidecar is thin — read active window, optionally grab a screenshot, emit JSON.

- **Windows:** Rust binary using Win32 APIs (foreground window, browser URL extraction)
- **macOS:** Swift binary using Accessibility APIs + Vision framework

### Stage 2 — Boundary Detection (TypeScript)

Groups raw capture events into discrete activities. Two idle thresholds operate at different levels:

- **Activity idle gap** (default 30s): No input or window change for this duration closes the current activity. Short threshold to capture fine-grained workflow steps.
- **Session idle gap** (default 5min): No activity for this duration closes the current session. Longer threshold representing a meaningful break in work (e.g., meeting, lunch, away from desk).

Additional activity boundaries:
- **App switch:** Different app_name from previous event
- **Max duration:** Configurable cap (default 5min) to prevent single activities from growing unbounded

Outputs `Activity` records with start/end timestamps and all associated capture events.

### Stage 3 — Transform (TypeScript)

Two paths depending on capture mode:

**Title-only mode (default):**
- Categorize the app (Browser, Development, Communication, Productivity, Design, Other)
- Clean/normalize the window title
- Extract domain from URL if present

**Screenshot mode (opt-in):**
- OCR via platform-native APIs (macOS Vision / Windows native OCR)
- LLM summarization via configurable endpoint
- Falls back to title-only if LLM endpoint is unavailable (offline resilience)

### Stage 4 — Store (TypeScript)

- Write activity record to SQLite
- Generate embedding via `@huggingface/transformers` (384-dim)
- Update FTS5 index (summary, ocr_text, window_title)
- Compute and store transition record from previous activity in same session

### Stage 5 — Analyze (TypeScript, periodic)

Runs on a schedule (default every 30 minutes) or on-demand via MCP tool call. Does not run per-activity.

- Scans recent transitions and sessions for recurring patterns
- Detects: repeated sequences, friction signals (rapid switching, false starts), automation candidates (identical recurring flows)
- Updates `patterns` and `pattern_sightings` tables
- Assigns confidence scores based on occurrence count and consistency

Implementation uses a mix of SQL aggregation and TypeScript post-processing:
- **SQL layer:** Aggregates transition counts, computes per-session switch rates, identifies high-frequency app pairs
- **TypeScript layer:** Reads transition windows and runs sequence matching (n-gram comparison across sessions), computes pattern similarity, assigns confidence scores
- Pattern definitions are stored as structured JSON in the `patterns.definition` column so MCP tools can return what the pattern actually is, not just a label

## Storage Schema

```sql
-- Core activity records
activities (
  id              TEXT PRIMARY KEY,    -- UUID
  device_id       TEXT NOT NULL,       -- Stable device identifier
  session_id      TEXT NOT NULL,       -- FK → sessions
  timestamp_start INTEGER NOT NULL,    -- Unix ms
  timestamp_end   INTEGER NOT NULL,    -- Unix ms
  app_name        TEXT NOT NULL,
  window_title    TEXT NOT NULL,
  url             TEXT,
  display_id      TEXT,               -- Monitor identifier (multi-monitor context)
  app_category    TEXT NOT NULL,       -- Browser|Development|Communication|Productivity|Design|Other
  capture_mode    TEXT NOT NULL,       -- title_only|screenshot
  summary         TEXT,               -- LLM-generated (screenshot mode)
  ocr_text        TEXT,               -- OCR output (screenshot mode)
  scrubbed        INTEGER DEFAULT 0,  -- Boolean: redacted by user
  submitted_at    INTEGER,            -- Unix ms, for export/S3
  created_at      INTEGER NOT NULL
)

-- Work sessions grouped by idle gaps
sessions (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  idle_threshold_ms INTEGER NOT NULL,
  activity_count  INTEGER DEFAULT 0,
  dominant_app    TEXT,
  summary         TEXT
)

-- App-to-app transitions (derived, powers analysis tools)
transitions (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL,
  from_app        TEXT NOT NULL,
  to_app          TEXT NOT NULL,
  from_activity_id TEXT NOT NULL,
  to_activity_id  TEXT NOT NULL,
  timestamp       INTEGER NOT NULL,
  duration_in_source_ms INTEGER NOT NULL
)

-- Detected recurring patterns
patterns (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  pattern_type    TEXT NOT NULL,       -- sequence|frequency|friction|automation
  definition      TEXT NOT NULL,       -- JSON: structured pattern representation
                                       -- sequence: {"apps": ["Excel","SAP","Email"], "avg_duration_ms": 45000}
                                       -- friction: {"app_pair": ["Excel","SAP"], "switches_per_session": 8, "threshold": 3}
                                       -- automation: {"sequence": ["Excel","SAP","Email"], "title_pattern": "Invoice*", "frequency": "daily"}
  first_seen      INTEGER NOT NULL,
  last_seen       INTEGER NOT NULL,
  occurrence_count INTEGER NOT NULL,
  confidence      REAL NOT NULL,       -- 0.0–1.0
  created_at      INTEGER NOT NULL
)

-- Individual pattern occurrences
pattern_sightings (
  id              TEXT PRIMARY KEY,
  pattern_id      TEXT NOT NULL,
  session_id      TEXT NOT NULL,
  timestamp       INTEGER NOT NULL,
  activity_ids    TEXT NOT NULL         -- JSON array of activity IDs
)

-- User/AI-applied workflow labels
tags (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE  -- e.g. "invoice processing", "code review"
)

activity_tags (
  activity_id     TEXT NOT NULL,
  tag_id          TEXT NOT NULL,
  source          TEXT NOT NULL,        -- user|ai
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (activity_id, tag_id)
)

-- Vector embeddings for semantic search
activities_vec (
  id              TEXT,
  embedding       FLOAT[384]
)

-- Full-text search index (FTS5 with sync triggers)
activities_fts (
  summary, ocr_text, window_title
)

-- Privacy audit trail
scrub_log (
  id              TEXT PRIMARY KEY,
  activity_id     TEXT NOT NULL,
  scrubbed_at     INTEGER NOT NULL,
  fields_scrubbed TEXT NOT NULL         -- JSON array: ["window_title", "summary", ...]
)

-- MCP query audit (consultant mode)
query_log (
  id              TEXT PRIMARY KEY,
  tool_name       TEXT NOT NULL,
  parameters      TEXT NOT NULL,        -- JSON
  queried_at      INTEGER NOT NULL,
  consent_mode    TEXT NOT NULL          -- self|consultant
)

-- Queued screenshots awaiting LLM processing (survives app crashes)
pending_transforms (
  activity_id     TEXT PRIMARY KEY,
  screenshot_path TEXT NOT NULL,
  created_at      INTEGER NOT NULL
)

-- Data retention config
retention_config (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL          -- e.g. retention_days: "90"
)
```

Key schema decisions:
- **`device_id` on activities and sessions** — supports future multi-user aggregate analysis without requiring a central database
- **`transitions` as first-class table** — backbone of friction detection, happy path mapping, and automation discovery
- **Scrubbing is per-field, audited** — enterprise compliance requirement
- **`capture_mode` per activity** — supports layered approach (some activities have screenshots, others don't)
- **Patterns stored, not just computed** — MCP tools return fast without re-analyzing
- **`tags` + `activity_tags`** — user or AI can label activities with workflow names for targeted analysis
- **`query_log`** — audit trail for consultant mode MCP access
- **`retention_config`** — configurable auto-purge (default 90 days)

## MCP Server

### Transport

Runs as a separate entry point using the same Electron binary with `ELECTRON_RUN_AS_NODE=1`. Stdio transport for universal MCP client compatibility.

### Server Instructions

Sent to the AI assistant on connection:

```
You are connected to Taskmass, a process intelligence agent that captures
what users actually do on their computers. Use these tools to understand
workflow patterns, identify friction, and discover automation opportunities.

Guidelines:
- Analysis tools return pre-computed pattern insights. Use these first when
  asked about friction, bottlenecks, or automation possibilities.
- Data tools return raw activity data. Use these for specific questions or
  to drill into analysis results.
- Only non-scrubbed records are queryable. Scrubbed records are redacted.
- Window titles may contain sensitive info. Summarize rather than quote
  verbatim unless the user asks for exact details.
- Activities can be tagged with workflow labels. Use tag_activity to label
  activities for more targeted future analysis.
```

### Data Tools

| Tool | Purpose | Parameters |
|------|---------|------------|
| `search_activities` | Semantic + full-text search over activity history | `query`, `time_range`, `app_filter`, `tag_filter`, `mode` (text\|vector), `limit` |
| `browse_timeline` | Paginated activity feed with uniform sampling | `start`, `end`, `app_filter`, `tag_filter`, `limit` |
| `get_activity_details` | Full record including OCR text if captured | `activity_id` |
| `list_sessions` | Browse work sessions grouped by idle gaps | `date`, `min_duration`, `app_filter` |
| `get_transitions` | App-to-app switching sequences for a time range | `time_range`, `app_filter`, `session_id` |

### Analysis Tools

| Tool | Purpose | Parameters | Returns |
|------|---------|------------|---------|
| `detect_friction` | Identifies friction signals in activity data | `time_range`, `app_filter`, `tag_filter`, `session_id` | Rapid app-switching loops, repeated sequences, short-duration activities (false starts), high switch-rate sessions |
| `map_happy_path` | Reconstructs the clean version of a workflow | `tag_filter` (required), `app_filter`, `time_range` | Most common successful sequence for a given tag/app combination, with average timing |
| `surface_constraints` | Identifies external blockers and forced waits | `time_range`, `app_filter`, `tag_filter` | Idle gaps mid-workflow, dependency patterns (app A blocks on app B), time-of-day constraints |
| `find_flow_issues` | Spots bottlenecks and unnecessary steps | `time_range`, `app_filter`, `tag_filter` | Redundant transitions, excessive steps vs. baseline, broken handoffs between apps |
| `suggest_automation` | Flags repetitive, rule-based sequences | `time_range`, `app_filter`, `tag_filter`, `min_occurrences` | Recurring identical sequences, high-frequency low-variation patterns, estimated time savings |

### Management Tools

| Tool | Purpose | Parameters |
|------|---------|------------|
| `tag_activity` | Apply a workflow label to an activity | `activity_id`, `tag_name` |
| `list_tags` | List all tags with activity counts | — |
| `run_analysis` | Trigger pattern detection on-demand | `time_range` (optional) |
| `get_org_context` | Returns org profile and current user profile | — |
| `update_org_context` | Update org or user profile fields | `target` (org\|user), `fields` (JSON) |

### Consent Model

- **`self_only` mode (default):** Only the local user's AI assistant can query. No audit logging.
- **`consultant` mode:** Allows a shared MCP connection. Requires explicit user approval per session via the UI. All queries logged to `query_log` table.
- Scrubbed activities are excluded from all MCP responses regardless of mode.

### Analysis Tool Implementation

Analysis tools use SQL aggregations and TypeScript post-processing to return structured JSON. They do not call an LLM — the connected AI assistant interprets the results.

**`detect_friction` example queries:**
- Transitions where the same app pair occurs >3 times in a session (context-switching loops)
- Activities with duration <10s followed by return to the same app (false starts)
- Sessions exceeding N app switches per minute (thrashing threshold)

**`suggest_automation` example queries:**
- Identical transition sequences (A→B→C→A→B→C) recurring across 3+ sessions
- Activities in the same app with similar window titles repeating daily
- High-frequency patterns with low title variation (same task, same steps)

**`surface_constraints` example queries:**
- Idle gaps >2min occurring mid-session (not at session boundaries)
- Consistent patterns where app A activity is always followed by a wait before app B
- Time-of-day clustering suggesting external dependencies (meetings, batch jobs)

## CLI

Standalone binary for querying the Taskmass database without the Electron app running.

### Commands

```bash
taskmass stats                              # Database statistics
taskmass search "invoice processing"        # Full-text search
taskmass search "data entry" --mode vector  # Semantic search
taskmass timeline --limit 20               # Recent activities
taskmass timeline --app Excel --tag "invoicing"  # Filtered
taskmass activity <id>                      # Activity details
taskmass sessions --date 2026-03-10         # Sessions for a date
taskmass patterns                           # Detected patterns
taskmass pattern <id>                       # Pattern details with sightings
taskmass friction --days 7                  # Friction report
taskmass set-db <path>                      # Configure DB location
```

### MCP Server Mode

```bash
taskmass-mcp                                # Stdio MCP server without Electron
```

Allows AI agents to query Taskmass data in environments where the Electron app isn't running (CI, headless servers, agent pipelines).

### DB Path Resolution

1. `--db-path` flag
2. `TASKMASS_DB_PATH` environment variable
3. Saved config via `set-db`
4. Platform default (`%APPDATA%/Taskmass/taskmass.db` on Windows, `~/Library/Application Support/Taskmass/taskmass.db` on macOS)

## Minimal Electron UI

Tray app, no main window by default. Settings/review window opened on demand.

### Tray Menu

- Start / Stop Capture
- Capture Mode: Title Only / Full (screenshots)
- Open Settings
- Quit

### Settings Window

Four tabs:

| Tab | Contents |
|-----|----------|
| **Capture** | Idle threshold (default 30s), max activity duration (default 5min), capture interval, screenshot toggle |
| **Privacy** | App exclusion list, URL exclusion list, window title keyword blocklist, data retention period (30/60/90 days) |
| **LLM** | Endpoint config (OpenRouter / custom / Ollama), API key, model selection |
| **MCP** | Connection status, consent mode toggle (self/consultant), one-click setup for Claude Desktop / Claude Code / Cursor |

### Data Review Screen

Accessible from tray menu or settings:
- Scrollable activity list with search and filter (by app, date, tag)
- Per-activity scrub button (redacts selected fields, logs to `scrub_log`)
- Bulk scrub by app, date range, or keyword match
- Tag management (apply/remove tags)
- Export: filtered dataset to JSON (for aggregate analysis across team members). Export behavior:
  - Scrubbed activities are excluded entirely
  - Activities matching app/URL exclusion lists are excluded
  - Window titles are included verbatim for non-scrubbed, non-excluded records — users should scrub sensitive titles before exporting
  - The export UI shows a preview count and a reminder to review/scrub before exporting
  - Export files are plaintext JSON; encryption in transit is the consulting team's responsibility
- No analytics, no charts — analysis is the AI's job

## Offline Resilience

- Capture always runs regardless of LLM availability
- If the LLM endpoint is unavailable during screenshot mode, activities are stored with `summary = NULL` and queued for processing when connectivity returns
- Title-only mode requires no external services and always works
- Embeddings are generated locally via `@huggingface/transformers` — no network dependency

## Data Retention

- Configurable auto-purge: 30, 60, or 90 days (default 90)
- Purge runs daily, deletes activities older than threshold
- Patterns are retained independently of activity purge. Since `activity_ids` in `pattern_sightings` is a JSON array (not FK-constrainable), a daily cleanup job in application code removes sightings where all referenced activity IDs no longer exist. The parent `patterns` record persists with its definition, counts, and confidence intact.
- Export before purge is recommended for consulting engagements

## Multi-User Aggregate Analysis (Future)

Each Taskmass instance stamps records with a `device_id`. For consulting engagements requiring cross-team analysis:

1. Each team member exports their scrubbed dataset (JSON) from the data review screen
2. Exports are combined into a shared analysis dataset
3. The consultant's AI assistant analyzes the aggregate data in a chat session

This keeps all data local and user-controlled. No central server required. The schema supports this via `device_id` on all core records.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Capture (Windows)** | Rust (Win32 APIs) |
| **Capture (macOS)** | Swift (Accessibility + Vision) |
| **Pipeline + MCP + Storage** | TypeScript (Node.js under Electron) |
| **Database** | SQLite via better-sqlite3, sqlite-vec, FTS5 |
| **Embeddings** | @huggingface/transformers (local, 384-dim) |
| **LLM** | OpenRouter / custom OpenAI-compatible / Ollama |
| **UI** | React + Tailwind v4 + shadcn/ui |
| **Desktop** | Electron (electron-vite build, electron-builder packaging) |
| **CLI** | TypeScript (standalone Node.js package) |

## Build System

- **electron-vite** for unified Vite config (main, preload, renderer)
- **Dual entry points:** `index.ts` (tray app) + `mcp-entry.ts` (MCP server)
- **electron-builder** for packaging (macOS dmg, Windows NSIS, Linux deb/rpm)
- **Native sidecars** built separately: `build:rust` (Windows), `build:swift` (macOS)
- **vitest** for testing with co-located test files (`module.test.ts`)

## Screenshot Lifecycle

Screenshots are transient — captured, processed, and deleted:

1. Sidecar writes PNG to OS temp directory (`%TEMP%/taskmass/` or `/tmp/taskmass/`)
2. Pipeline Stage 3 reads the PNG for OCR and LLM summarization
3. On successful transform, the PNG is deleted immediately
4. On transform failure (LLM unavailable), the activity is stored with `summary = NULL` and the PNG path is recorded in a `pending_transforms` SQLite table (`activity_id`, `screenshot_path`, `created_at`). This table survives app crashes.
5. A retry job runs periodically (every 5 min) when LLM connectivity is restored; PNGs are deleted after successful processing and the `pending_transforms` row is removed
6. Orphaned PNGs (older than 24h) are cleaned up on app startup

Screenshots are never included in exports, never stored in SQLite, and never accessible via MCP tools. Only their derived text (OCR, summary) persists.

## Platform Permissions

### macOS
- **Accessibility** — required for reading active window info and monitoring input activity. The app prompts on first launch and guides the user to System Settings > Privacy & Security > Accessibility.
- **Screen Recording** — required only in screenshot capture mode. Prompted when the user enables screenshot mode. Not needed for title-only capture.
- The app detects permission denial gracefully and falls back to title-only mode with a tray notification explaining what's missing.

### Windows
- No special permissions required for window title monitoring (Win32 APIs are unrestricted)
- Screenshot capture uses standard screen capture APIs, no elevation needed
- Windows OCR depends on language pack availability; if unavailable, OCR is skipped and the activity proceeds with LLM summarization from the screenshot alone

## Sidecar Supervision

The TypeScript host process manages native sidecars as child processes:

- Sidecar stdout is parsed as newline-delimited JSON
- If a sidecar exits unexpectedly, the host restarts it after a 2s backoff (max 5 retries, then pause capture and notify via tray)
- If a sidecar stops producing events for >60s while capture is active, the host sends a health check ping; no response triggers a restart
- Sidecar crashes do not affect stored data or the MCP server

## Schema Migrations

Numbered migration files in `src/main/storage/migrations/` (same pattern as MemoryLane):

- Each migration is a TypeScript file exporting `up()` and `down()` functions
- Migrations run automatically on app startup
- A `schema_version` table tracks the current version
- Opening a database from a newer version than the app refuses to start with a clear error message

## Migration from Taskmass v2

This is a clean break. Taskmass v3 is a new codebase with a new schema:

- The existing Python tracker, Next.js dashboard, and `local_task_mining.sqlite` database are retired
- No automatic data migration — v2 data is retained in its original location but not imported
- If historical data from v2 is needed, a one-time migration script can be written to map v2 `activity_logs` to v3 `activities`, but this is not a launch requirement

## Logging and Diagnostics

- Structured logging via `electron-log` (file + console in dev)
- Debug pipeline mode (`npm run dev:debug-pipeline`) dumps raw capture events, boundary decisions, and transform results
- Tray menu shows capture status: events/minute, activities/hour, last activity timestamp
- LLM endpoint health: latency, failure rate, and cost tracked per-session
- Database size shown in settings

## Test Strategy

- Co-located unit tests: `module.test.ts` next to `module.ts`
- Integration tests gated by environment variables (native capture, LLM endpoints)
- Storage tests using in-memory SQLite via test utilities
- Each pipeline stage testable in isolation
- MCP tools testable against a seeded test database
