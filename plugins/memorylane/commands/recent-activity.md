---
allowed-tools: mcp__memorylane__browse_timeline, mcp__memorylane__get_activity_details
description: Summarize what you've been doing recently
---

## Your task

Summarize the user's recent screen activity from the last 30 minutes.

Use `browse_timeline` with a 30 minute window and `sampling="uniform"` to get an overview, then summarize what the user was working on. Group by app/task and note approximate time spent on each.
