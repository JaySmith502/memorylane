# Pattern Detector Benchmark Results

Date: 2026-02-20
Lookback: 2 days
Activities in DB: ~10,100

## Scorecard

| Model                      | Score      | Cost       | Iters | Input Tokens | Verdict                                                         |
| -------------------------- | ---------- | ---------- | ----- | ------------ | --------------------------------------------------------------- |
| **claude-sonnet-4.6**      | **8/10**   | **$0.527** | 5     | 157K         | Best quality/cost ratio                                         |
| **claude-opus-4.6**        | **8.5/10** | $2.80      | 15    | 534K         | Best analysis, but 5.3x the price of sonnet 4.6 for +0.5 points |
| **kimi-k2.5**              | **7/10**   | **$0.09**  | 7     | 133K         | Best bang for buck. Solid finds at 1/6th the cost of sonnet     |
| **glm-5**                  | **7/10**   | $0.196     | 10    | 285K         | Same quality as kimi at 2x the cost                             |
| **gemini-3.1-pro-preview** | **7/10**   | ~$0        | 14    | 234K         | Free tier? Great if actually $0, but slow (14 iters)            |
| **claude-sonnet-4.5**      | **6.5/10** | $0.569     | 6     | 177K         | Worse than 4.6 and costs more                                   |
| **gemini-3-flash-preview** | **5/10**   | ~$0        | 6     | 47K          | Cheapest + fastest, but one bad finding                         |
| **minimax-m2.5**           | **5/10**   | $0.085     | 10    | 220K         | Cheap but missed the biggest pattern                            |
| **gpt-5.2**                | **4.5/10** | $0.263     | 5     | 124K         | Missed OCR benchmarking. Poor value at that price               |
| **deepseek-v3.2**          | **0/10**   | $0         | 3     | 17K          | Broken tool use — emitted garbled XML instead of tool calls     |

## Cost-Efficiency (score per dollar)

| Model                  | Score/$      |
| ---------------------- | ------------ |
| gemini-3.1-pro-preview | ~inf (free?) |
| gemini-3-flash-preview | ~inf (free?) |
| kimi-k2.5              | 77.9         |
| minimax-m2.5           | 58.8         |
| glm-5                  | 35.7         |
| gpt-5.2                | 17.1         |
| claude-sonnet-4.6      | 15.2         |
| claude-sonnet-4.5      | 11.4         |
| claude-opus-4.6        | 3.0          |

## Projected Daily Cost (if running every 30 min = 48 runs/day)

- kimi-k2.5: ~$4.30/day
- claude-sonnet-4.6: ~$25/day
- claude-opus-4.6: ~$134/day

## Scoring Criteria

### Deductions

- **DKIM/DNS setup**: One-off task for 2 domains on one afternoon. Not a recurring pattern. Models giving it high confidence (sonnet 4.5 gave 0.9) were penalized.
- **"OCR Threshold Tuning"** (gemini-3-flash-preview): This is development work, not automatable drudge work. -1.
- **"AI Model Comparison Research"** (minimax-m2.5): Browsing OpenRouter to pick models is research, not automation. -1.
- **Missing OCR benchmarking** (gpt-5.2, minimax-m2.5): Strongest and most obvious automation candidate. Missing it = -2.

### What good looks like

- Correctly identifying genuinely automatable tasks vs one-offs vs dev work
- Calibrated confidence scores (low for one-offs, high for clearly recurring)
- Specific evidence (dates, window titles, activity IDs)
- Actionable automation ideas (naming specific APIs, tools)
- Efficiency (fewer iterations, less token waste)

## Ground Truth Patterns Found

### 1. OCR Model Benchmarking (found by 8/10 models)

Strongest signal. Manual model-by-model testing in OpenRouter playground, copying results into Notion/markdown tables. User literally started automating it during the session (run-benchmarks.sh).

### 2. Smartlead Email Campaign Monitoring (found by 7/10)

Daily dashboard polling — checking warmup reputation, daily limits, campaign metrics for 9+ email accounts. API-automatable.

### 3. OpenRouter API Key Monitoring (found by 7/10)

Multiple daily visits to check usage/costs for team API keys. Genuine but low-impact (~2 min per check).

### 4. GitHub Stargazer → Email Pipeline (found by 4/10)

Real workflow: extract stargazers from repos, enrich emails, import into Smartlead campaigns. Webhook-automatable. Fewer models found this — requires connecting dots across multiple apps.

### 5. DKIM/DNS Configuration (found by 7/10)

One-off task, not recurring. Some models correctly noted this ("occasional", low confidence). Others incorrectly treated it as a pattern.

## Recommendation

- **For production (periodic detection)**: kimi-k2.5 at $0.09/run — 7/10 quality at minimal cost
- **For one-off deep analysis**: claude-sonnet-4.6 at $0.53 — best quality without Opus pricing
- **Avoid**: deepseek-v3.2 (broken), gpt-5.2 (missed key patterns at moderate cost)
