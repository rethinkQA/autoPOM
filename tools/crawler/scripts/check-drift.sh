#!/usr/bin/env bash

# Phase 13.2 — Drift Detection CI Script
#
# Crawl all 7 apps and compare against saved baseline manifests.
# Exits 1 if any manifest has drifted (groups added/removed/changed).
#
# Prerequisites:
#   - All 7 apps running on ports 3001–3007
#   - Baseline manifests saved in manifests/ (run: npm run save-baselines)
#
# Usage:
#   ./scripts/check-drift.sh
#   npm run check-drift

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRAWLER_DIR="$(dirname "$SCRIPT_DIR")"
MANIFESTS_DIR="$CRAWLER_DIR/manifests"
BIN="$CRAWLER_DIR/bin/pw-crawl.ts"

APPS=(
  "vanilla:3001"
  "react:3002"
  "vue:3003"
  "angular:3004"
  "svelte:3005"
  "nextjs:3006"
  "lit:3007"
)

PASSED=0
FAILED=0
SKIPPED=0
ERRORS=""

echo "=== Phase 13.2: Drift Detection ==="
echo ""

for entry in "${APPS[@]}"; do
  IFS=":" read -r name port <<< "$entry"
  url="http://localhost:${port}/"
  baseline="$MANIFESTS_DIR/${name}.json"

  if [[ ! -f "$baseline" ]]; then
    echo "⊘ ${name} — no baseline manifest (run: npm run save-baselines)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Check if app is running
  if ! curl -s -o /dev/null -w '' --connect-timeout 2 "$url" 2>/dev/null; then
    echo "⊘ ${name} — app not running on port ${port}"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo -n "  ${name}... "

  # Use the CLI's --diff mode
  output=$(npx tsx "$BIN" "$url" --diff "$baseline" 2>&1) && exit_code=$? || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    echo "✓ no drift"
    PASSED=$((PASSED + 1))
  else
    echo "✗ DRIFT DETECTED"
    ERRORS="${ERRORS}\n--- ${name} ---\n${output}\n"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Results: ${PASSED} passed, ${FAILED} drifted, ${SKIPPED} skipped"

if [[ -n "$ERRORS" ]]; then
  echo ""
  echo "=== Drift details ==="
  echo -e "$ERRORS"
fi

if [[ $FAILED -gt 0 ]]; then
  echo ""
  echo "❌ Drift detected — update baselines with: npm run save-baselines"
  exit 1
fi

if [[ $SKIPPED -gt 0 && $PASSED -eq 0 ]]; then
  echo ""
  echo "⚠ No apps could be checked. Start apps and save baselines first."
  exit 1
fi

echo ""
echo "✅ All checked manifests match baselines."
exit 0
