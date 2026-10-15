#!/usr/bin/env bash
# Design-token gate (Story 1.8; DESIGN.md Colors; D13). Exits non-zero on any hit.
#
# Scans app code (tests excluded) under components/, features/, app/, lib/
# (except lib/server/, which has no UI), hooks/ and contexts/, except
# app/globals.css, which is the one home of color values:
#   1. hex colors (#abc, #abcd, #aabbcc, #aabbccdd), including Tailwind
#      arbitrary values like bg-[#fff]; comment-only lines (issue refs) are skipped;
#   2. Tailwind palette color classes (bg-red-500, text-white, bg-black/50,
#      drop-shadow-red-500, text-shadow-red-500, bg-mauve-500, ...), every
#      Tailwind 4.3 palette, also through the palette's CSS variable
#      (bg-(--color-red-500), bg-[var(--color-red-500)]);
#      semantic tokens (bg-destructive-fill, text-neutral, ...) are fine;
#   3. text-info-strong on a link (use text-link-text);
#   4. bg-error-strong anywhere (use bg-destructive-fill).
#
# JSON files under app/ and components/ (theme or fixture data) are scanned too;
# CSS (including *.module.css) is scanned everywhere in scope.
#
# Usage: check-tokens.sh [root]   (root defaults to the repository; tests pass a fixture tree)
set -euo pipefail

root="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$root"

status=0

report() {
  echo "check-tokens: $1" >&2
  printf '%s\n' "$2" | sed 's/^/  /' >&2
  status=1
}

files=$(
  {
    for dir in components features app lib hooks contexts; do
      [[ -d "$dir" ]] || continue
      find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.mjs' -o -name '*.css' \)
    done
    for dir in app components; do
      [[ -d "$dir" ]] || continue
      find "$dir" -type f -name '*.json'
    done
  } \
    | grep -Ev '\.test\.(ts|tsx|js|jsx)$' \
    | grep -Fxv 'app/globals.css' \
    | grep -Ev '^lib/server/' \
    | sort || true
)

# matches "<extended regex>" → "path:line:content" for every matching line.
# Only grep's exit 1 means "no match"; any grep error (exit >= 2) aborts the check.
matches() {
  [[ -z "$files" ]] && return 0
  local rc=0
  printf '%s\n' "$files" | tr '\n' '\0' \
    | xargs -0 sh -c 'grep -nE -- "$0" "$@" /dev/null; rc=$?; [ "$rc" -le 1 ] || exit 255' "$1" || rc=$?
  if [[ $rc -ne 0 ]]; then
    echo "check-tokens: grep failed (exit $rc) for pattern: $1" >&2
    exit 2
  fi
}

# filter [-v] "<extended regex>": keeps (or with -v drops) the "path:line:content" lines that match.
# Same exit-code rule as matches(): only "no match" (1) is tolerated.
filter() {
  local rc=0
  grep -E "$@" || rc=$?
  if [[ $rc -gt 1 ]]; then
    echo "check-tokens: grep failed (exit $rc) for pattern: ${*: -1}" >&2
    exit 2
  fi
}

# hits "<extended regex>" → "path:line" for every matching line.
hits() {
  local found
  found=$(matches "$1") || exit 2
  [[ -n "$found" ]] && printf '%s\n' "$found" | cut -d: -f1,2
  return 0
}

HEX='(^|[^&0-9A-Za-z_])#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3,4})([^0-9A-Za-z_-]|$)'
PREFIX='(bg|text|border|border-[xytrblse]|ring|ring-offset|outline|fill|stroke|from|via|to|divide|placeholder|decoration|shadow|drop-shadow|text-shadow|accent|caret|inset-shadow|inset-ring)'
PALETTE='(slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|[1-9]00|950)'
CLASS="(^|[^A-Za-z0-9_-])${PREFIX}-(${PALETTE}|black|white)([^A-Za-z0-9_-]|$)"
# The same palette through its Tailwind CSS variable: bg-(--color-red-500), bg-[var(--color-red-500)].
CLASS_VAR="(^|[^A-Za-z0-9_-])${PREFIX}-(\\(|\\[var\\()--color-(${PALETTE}|black|white)([^A-Za-z0-9_-]|$)"
LINK_LINE='<a[[:space:]>]|<Link[[:space:]>]|href=|variant=["'"'"']link|underline'
# "path:line:" then a line that is only a comment (//, /*, *, {/*).
COMMENT_LINE='^[^:]+:[0-9]+:[[:space:]]*(//|/\*|\*|\{/\*)'

found=$(matches "$HEX")
found=$([[ -z "$found" ]] || printf '%s\n' "$found" | filter -v "$COMMENT_LINE" ) || exit 2
found=$([[ -z "$found" ]] || printf '%s\n' "$found" | cut -d: -f1,2)
[[ -n "$found" ]] && report "hex color outside app/globals.css (use a semantic token):" "$found"

found=$(hits "$CLASS")
[[ -n "$found" ]] && report "Tailwind palette color class (use a semantic token):" "$found"

found=$(hits "$CLASS_VAR")
[[ -n "$found" ]] && report "Tailwind palette color class via its CSS variable (use a semantic token):" "$found"

found=$(matches 'text-info-strong')
found=$([[ -z "$found" ]] || printf '%s\n' "$found" | filter "$LINK_LINE") || exit 2
found=$([[ -z "$found" ]] || printf '%s\n' "$found" | cut -d: -f1,2)
[[ -n "$found" ]] && report "text-info-strong on a link (use text-link-text, D13):" "$found"

found=$(hits 'bg-error-strong')
[[ -n "$found" ]] && report "bg-error-strong (use bg-destructive-fill, D13):" "$found"

if [[ $status -eq 0 ]]; then echo "check-tokens: OK"; fi
exit $status
