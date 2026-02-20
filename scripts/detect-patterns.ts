#!/usr/bin/env npx tsx
/**
 * Prototype: Agentic pattern detector
 *
 * Connects to the MemoryLane DB and uses an LLM (via OpenRouter) with local tools
 * to discover recurring patterns in activity history. The model gets tools to
 * query the database and iteratively explores the data.
 *
 * Usage:
 *   npm run detect-patterns
 *   npm run detect-patterns -- --model google/gemini-2.5-flash-preview
 *   npm run detect-patterns -- --model anthropic/claude-sonnet-4 --days 14
 */

import { config as loadEnv } from 'dotenv'
loadEnv()

import * as fs from 'fs'
import { StorageService, type ActivitySummary } from '../src/main/storage/index'
import { getDefaultDbPath } from '../src/main/paths'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4'
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_ITERATIONS = 25

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

// ---------------------------------------------------------------------------
// Tool definitions (sent to the LLM)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_activities',
      description:
        'Get activity summaries within a time range. Returns id, timestamp, duration, app name, and LLM-generated summary.',
      parameters: {
        type: 'object',
        properties: {
          days_back: {
            type: 'number',
            description: 'Number of days back from now. Default 7.',
          },
          app_name: {
            type: 'string',
            description: 'Optional: filter by app name (case-insensitive)',
          },
          limit: {
            type: 'number',
            description:
              'Max results. Default 50. Activities are uniformly sampled if there are more.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_activities',
      description:
        'Full-text search across activity summaries and OCR text. Good for finding specific topics, files, URLs, or concepts.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords' },
          limit: { type: 'number', description: 'Max results. Default 20.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_app_usage_stats',
      description:
        'Aggregate stats: which apps were used, activity count per app, total time, and active hours of day. Good starting point.',
      parameters: {
        type: 'object',
        properties: {
          days_back: { type: 'number', description: 'Days back. Default 7.' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_daily_breakdown',
      description:
        'Activities grouped by date and hour. Shows what happened when — useful for finding time-based patterns and routines.',
      parameters: {
        type: 'object',
        properties: {
          days_back: { type: 'number', description: 'Days back. Default 7.' },
          app_name: { type: 'string', description: 'Optional: filter by app' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_activity_details',
      description:
        'Full details for specific activities by ID, including window titles and TLD. Use to drill into interesting activities.',
      parameters: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Activity IDs to fetch',
          },
        },
        required: ['ids'],
      },
    },
  },
]

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function uniformSample<T>(arr: T[], maxSize: number): T[] {
  if (arr.length <= maxSize) return arr
  const step = arr.length / maxSize
  const result: T[] = []
  for (let i = 0; i < maxSize; i++) {
    result.push(arr[Math.floor(i * step)])
  }
  return result
}

function formatActivity(a: ActivitySummary) {
  return {
    id: a.id,
    time: new Date(a.startTimestamp).toISOString(),
    duration_min: Math.round((a.endTimestamp - a.startTimestamp) / 60000),
    app: a.appName,
    summary: a.summary,
  }
}

async function executeLocalTool(
  storageService: StorageService,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const now = Date.now()

  switch (name) {
    case 'get_activities': {
      const daysBack = (args.days_back as number) || 7
      const limit = (args.limit as number) || 50
      const startTime = now - daysBack * 24 * 60 * 60 * 1000
      const activities = await storageService.getActivitiesByTimeRange(startTime, now, {
        appName: args.app_name as string | undefined,
      })
      return uniformSample(activities, limit).map(formatActivity)
    }

    case 'search_activities': {
      const query = args.query as string
      if (!query) return { error: 'query parameter is required' }
      const limit = (args.limit as number) || 20
      const results = await storageService.searchActivitiesFTS(query, limit)
      return results.map(formatActivity)
    }

    case 'get_app_usage_stats': {
      const daysBack = (args.days_back as number) || 7
      const startTime = now - daysBack * 24 * 60 * 60 * 1000
      const activities = await storageService.getActivitiesByTimeRange(startTime, now)

      const stats: Record<
        string,
        { count: number; totalMinutes: number; hours: Set<number>; days: Set<string> }
      > = {}
      for (const a of activities) {
        if (!stats[a.appName]) {
          stats[a.appName] = { count: 0, totalMinutes: 0, hours: new Set(), days: new Set() }
        }
        stats[a.appName].count++
        stats[a.appName].totalMinutes += (a.endTimestamp - a.startTimestamp) / 60000
        stats[a.appName].hours.add(new Date(a.startTimestamp).getHours())
        stats[a.appName].days.add(new Date(a.startTimestamp).toISOString().split('T')[0])
      }

      return Object.entries(stats)
        .sort(([, a], [, b]) => b.count - a.count)
        .map(([app, s]) => ({
          app,
          activity_count: s.count,
          total_minutes: Math.round(s.totalMinutes),
          active_hours: [...s.hours].sort((a, b) => a - b),
          active_days: [...s.days].sort(),
        }))
    }

    case 'get_daily_breakdown': {
      const daysBack = (args.days_back as number) || 7
      const startTime = now - daysBack * 24 * 60 * 60 * 1000
      const activities = await storageService.getActivitiesByTimeRange(startTime, now, {
        appName: args.app_name as string | undefined,
      })

      const byDay: Record<string, { app: string; hour: number; summary: string }[]> = {}
      for (const a of activities) {
        const date = new Date(a.startTimestamp)
        const dayKey = date.toISOString().split('T')[0]
        if (!byDay[dayKey]) byDay[dayKey] = []
        byDay[dayKey].push({
          app: a.appName,
          hour: date.getHours(),
          summary: a.summary,
        })
      }

      return Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, entries]) => ({
          date,
          activity_count: entries.length,
          entries: uniformSample(entries, 30),
        }))
    }

    case 'get_activity_details': {
      const ids = args.ids as string[]
      const activities = await storageService.getActivitiesByIds(ids)
      return activities.map((a) => ({
        id: a.id,
        time: new Date(a.startTimestamp).toISOString(),
        duration_min: Math.round((a.endTimestamp - a.startTimestamp) / 60000),
        app: a.appName,
        window_title: a.windowTitle,
        tld: a.tld,
        summary: a.summary,
      }))
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ---------------------------------------------------------------------------
// Agentic loop
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an automation analyst examining a user's computer activity history. Your job is to find work that is repetitive, manual, and could be automated away with a script, API call, or tool.

You have tools to query the activity database. Use them iteratively — form hypotheses, test them, drill down.

## What you're looking for

GOOD finds (automatable drudge work):
- Periodically checking values/dashboards and copying them into a spreadsheet or table
- Running the same manual steps repeatedly (e.g., benchmark runs, deploy procedures)
- Filling out forms, quotes, invoices with data that could be pulled from another system
- Copy-pasting data between apps (e.g., CRM → spreadsheet, email → ticket system)
- Repetitive lookup workflows (check status in one app, update in another)
- Manual reporting: gathering numbers from multiple sources into a doc/sheet
- Routine maintenance tasks done the same way each time

BAD finds (not useful, skip these):
- "User programs a lot" — obviously, they're a developer
- "User checks email every morning" — that's just life
- "User uses Chrome and VS Code" — that's just app usage, not a workflow
- Generic habits like "browses the web" or "writes code"
- Any pattern that doesn't have a clear automation opportunity

The key question for each finding: "Could a script, cron job, API integration, or macro do this instead of the human?"

## Approach
1. Start with get_app_usage_stats to understand the landscape
2. Use get_daily_breakdown to look for repetitive manual sequences
3. Search for specific topics like "spreadsheet", "copy", "update", "check", "report", "fill"
4. Drill into suspicious patterns with get_activity_details — window titles and URLs are crucial
5. Look for the SAME sequence of apps/actions happening multiple times across different days

## Output
When done exploring, output your findings as a JSON array:

\`\`\`json
[
  {
    "name": "Short name for the automatable task",
    "description": "What the user does manually, step by step",
    "apps": ["App1", "App2"],
    "frequency": "daily | multiple_times_daily | weekly | occasional",
    "time_spent_estimate": "~X minutes each time",
    "automation_idea": "How this could be automated (specific: which API, what script, what tool)",
    "confidence": 0.0-1.0,
    "evidence": "What data you saw that supports this — be specific about dates, window titles, summaries"
  }
]
\`\`\`

Be very selective. Only report things where you genuinely see repeated manual work that a computer could do. 2-3 high-quality finds beats 10 vague ones.`

async function runAgentLoop(
  apiKey: string,
  model: string,
  storageService: StorageService,
  lookbackDays: number,
): Promise<string> {
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Analyze my activity history from the last ${lookbackDays} days and find recurring patterns. Start exploring.`,
    },
  ]

  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    process.stdout.write(`\n--- Iteration ${i + 1} ---\n`)

    const body = {
      model,
      messages,
      tools: TOOLS,
      tool_choice: 'auto' as const,
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenRouter API error (${response.status}): ${err}`)
    }

    const data = (await response.json()) as {
      choices: { message: Message; finish_reason: string }[]
      usage?: { prompt_tokens: number; completion_tokens: number }
    }

    const msg = data.choices?.[0]?.message
    if (!msg) throw new Error('No message in response')

    // Track usage
    if (data.usage) {
      totalInputTokens += data.usage.prompt_tokens || 0
      totalOutputTokens += data.usage.completion_tokens || 0
      console.log(
        `  Tokens this turn: ${data.usage.prompt_tokens} in / ${data.usage.completion_tokens} out`,
      )
    }

    // Add assistant message to history
    messages.push({
      role: 'assistant',
      content: msg.content,
      tool_calls: msg.tool_calls,
    })

    // If thinking/text content, show it
    if (msg.content) {
      console.log(
        `  Assistant: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}`,
      )
    }

    // If no tool calls, we're done
    if (!msg.tool_calls?.length) {
      console.log(`\n=== Done after ${i + 1} iterations ===`)
      console.log(`Total tokens: ${totalInputTokens} input, ${totalOutputTokens} output`)
      console.log(`(Check OpenRouter dashboard for actual cost)`)
      return msg.content || ''
    }

    // Execute tool calls
    for (const toolCall of msg.tool_calls) {
      const { name, arguments: argsStr } = toolCall.function
      let args: Record<string, unknown>
      try {
        args = JSON.parse(argsStr)
      } catch {
        args = {}
      }

      console.log(`  Tool: ${name}(${JSON.stringify(args)})`)

      const result = await executeLocalTool(storageService, name, args)
      const resultStr = JSON.stringify(result, null, 2)

      console.log(`  → ${resultStr.length} chars returned`)

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: resultStr,
      })
    }
  }

  console.log(`\n=== Max iterations reached (${MAX_ITERATIONS}) ===`)
  console.log(`Total tokens: ${totalInputTokens} input, ${totalOutputTokens} output`)

  // Return last assistant message content
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  return lastAssistant?.content || 'Max iterations reached without final output.'
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2)
  let dbPath = getDefaultDbPath()
  let model = DEFAULT_MODEL
  let apiKey = process.env.OPENROUTER_API_KEY || ''
  let days = 7

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db-path' && args[i + 1]) {
      dbPath = args[i + 1]
      i++
    } else if (args[i] === '--model' && args[i + 1]) {
      model = args[i + 1]
      i++
    } else if (args[i] === '--api-key' && args[i + 1]) {
      apiKey = args[i + 1]
      i++
    } else if (args[i] === '--days' && args[i + 1]) {
      days = parseInt(args[i + 1], 10)
      i++
    }
  }

  return { dbPath, model, apiKey, days }
}

async function main() {
  const { dbPath, model, apiKey, days } = parseArgs()

  if (!apiKey) {
    console.error('Error: No API key. Set OPENROUTER_API_KEY env var or use --api-key <key>')
    process.exit(1)
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at: ${dbPath}`)
    process.exit(1)
  }

  console.log('=== Pattern Detector Prototype ===')
  console.log(`Database: ${dbPath}`)
  console.log(`Model:    ${model}`)
  console.log(`Lookback: ${days} days`)
  console.log('')

  const storageService = new StorageService(dbPath)
  await storageService.init()

  const count = await storageService.countRows()
  console.log(`Activities in DB: ${count}`)

  if (count === 0) {
    console.log('No activities to analyze.')
    await storageService.close()
    return
  }

  try {
    const result = await runAgentLoop(apiKey, model, storageService, days)
    console.log('\n=== RESULTS ===\n')
    console.log(result)
  } finally {
    await storageService.close()
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
