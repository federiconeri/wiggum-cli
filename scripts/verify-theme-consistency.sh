#!/usr/bin/env bash
# Verify consistent use of theme constants across enhanced summary components
#
# This script checks that RunCompletionSummary and SummaryBox components
# use theme constants (phase chars and colors) and don't have hard-coded values.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${SCRIPT_DIR}/../src"

echo "🔍 Verifying theme consistency in enhanced summary components..."
echo ""

# Check for hard-coded colors (hex, rgb, rgba)
echo "1. Checking for hard-coded colors..."
HARD_CODED_COLORS=$(grep -rE '#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgb\(|rgba\(' \
  "${SRC_DIR}/tui/components/RunCompletionSummary.tsx" \
  "${SRC_DIR}/tui/components/SummaryBox.tsx" 2>/dev/null || true)

if [ -n "$HARD_CODED_COLORS" ]; then
  echo "❌ Found hard-coded colors:"
  echo "$HARD_CODED_COLORS"
  exit 1
else
  echo "✓ No hard-coded colors found"
fi

# Check for hard-coded phase characters (not in unicode escape form)
echo ""
echo "2. Checking for hard-coded phase characters..."
# We allow unicode escapes in comments, but not literal chars outside theme.ts
HARD_CODED_CHARS=$(grep -rE '(✓|✗|○|◐)' \
  "${SRC_DIR}/tui/components/RunCompletionSummary.tsx" \
  "${SRC_DIR}/tui/components/SummaryBox.tsx" 2>/dev/null || true)

if [ -n "$HARD_CODED_CHARS" ]; then
  echo "❌ Found hard-coded phase characters:"
  echo "$HARD_CODED_CHARS"
  exit 1
else
  echo "✓ No hard-coded phase characters found"
fi

# Verify that both files import from theme
echo ""
echo "3. Checking theme imports..."
if ! grep -q "from.*theme\.js" "${SRC_DIR}/tui/components/RunCompletionSummary.tsx"; then
  echo "❌ RunCompletionSummary.tsx doesn't import from theme.js"
  exit 1
fi
if ! grep -q "from.*theme\.js" "${SRC_DIR}/tui/components/SummaryBox.tsx"; then
  echo "❌ SummaryBox.tsx doesn't import from theme.js"
  exit 1
fi
echo "✓ Both components import from theme.js"

echo ""
echo "✅ All theme consistency checks passed!"
