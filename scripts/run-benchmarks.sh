#!/bin/bash
# Run detect-patterns for multiple models and save output to .benchmarks/

cd "$(dirname "$0")/.."

MODELS=(
  "minimax/minimax-m2.5"
  "moonshotai/kimi-k2.5"
  "z-ai/glm-5"
  "google/gemini-3-flash-preview"
  "deepseek/deepseek-v3.2"
  "anthropic/claude-opus-4.6"
  "anthropic/claude-sonnet-4.5"
  "anthropic/claude-sonnet-4.6"
  "x-ai/grok-4.1-fast"
  "openai/gpt-5.2"
)

mkdir -p .benchmarks

for model in "${MODELS[@]}"; do
  slug="${model#*/}"
  outfile=".benchmarks/${slug}.md"

  if [ -f "$outfile" ]; then
    echo "=== SKIP $model (already exists: $outfile) ==="
    continue
  fi

  echo "=== RUNNING $model ==="
  echo "  Output: $outfile"

  node ./scripts/enode.js ./node_modules/.bin/tsx scripts/detect-patterns.ts \
    --model "$model" --days 2 \
    > "$outfile" 2>&1

  exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo "  FAILED (exit $exit_code) — see $outfile for details"
  else
    echo "  DONE"
  fi

  echo ""
done

echo "=== ALL BENCHMARKS COMPLETE ==="
ls -la .benchmarks/
