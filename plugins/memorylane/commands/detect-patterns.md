---
allowed-tools: mcp__memorylane__browse_timeline, mcp__memorylane__search_context, mcp__memorylane__get_activity_details, mcp__memorylane__list_patterns, mcp__memorylane__search_patterns, mcp__memorylane__get_pattern_details
description: Detect repeated workflow patterns and suggest automations
---

## Your task

Analyze the user's screen activity to detect repeated workflow patterns and suggest automations. First check existing patterns with `list_patterns`, then scan recent activity with `browse_timeline` over the last 7 days. Look for app-switching loops, semantic repetition, cross-day recurrence, and multi-step workflows. Present results as actionable automation suggestions.
