#!/usr/bin/env bash
#
# Forbidden-pattern gate (AD-1, AD-20).
#
# Fails if any of these appear in CLIENT source:
#   - NEXT_PUBLIC_*SECRET*            (secrets must never be public)
#   - secret-ish names ending _DEMO / _PROD  (one deployment per env; AD-3)
#   - document.cookie                 (tokens live only in the sealed cookie; AD-1)
#   - access_token                    (tokens never reach the browser; AD-1)
#
# And, over app/, components/ and features/ only (skipping app/globals.css, the
# one home of raw colors, and *.test.* files), the design-system color rules:
#   - hex colors                      (#fff, #256a8c, bg-[#fff], any file type)
#   - Tailwind palette classes        (bg-red-500, dark:text-white, bg-black/50,
#                                      border-t-slate-200/40, drop-shadow-red-500)
#     Allowed: transparent / current / inherit, and bare `neutral` (a 1health
#     token, text-neutral); `neutral-<shade>` still fails.
#
# Scope: the source dirs below, excluding lib/server (the only place that may
# read env/secrets), this script, and build/VCS/vendor trees. Runs in CI and
# locally: `bash scripts/check-forbidden.sh`.
set -euo pipefail

# Run from the repo root regardless of where the script is invoked.
cd "$(dirname "$0")/.."

SRC_DIRS=(app components contexts hooks features lib)

# Keep only the source dirs that currently exist.
EXISTING=()
for d in "${SRC_DIRS[@]}"; do
  [ -d "$d" ] && EXISTING+=("$d")
done

if [ "${#EXISTING[@]}" -eq 0 ]; then
  echo "check-forbidden: no source directories to scan."
  exit 0
fi

fail=0

run_grep() {
  local label="$1" pattern="$2" matches
  # Scan every source dir, then drop matches under lib/server (and only there —
  # the one allowed secret reader). A path-anchored filter, so a future
  # app/server or components/server stays in scope.
  matches=$(grep -rnE --binary-files=without-match \
    --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next \
    --exclude="check-forbidden.sh" \
    "$pattern" "${EXISTING[@]}" 2>/dev/null | grep -vE '^(\./)?lib/server/' || true)
  if [ -n "$matches" ]; then
    echo "FORBIDDEN [$label]:"
    echo "$matches"
    echo
    fail=1
  fi
}

run_grep "NEXT_PUBLIC_*SECRET*"      'NEXT_PUBLIC_[A-Za-z0-9_]*SECRET'
run_grep "_DEMO/_PROD secret name"   '[A-Z][A-Z0-9_]*_(DEMO|PROD)([^A-Za-z0-9_]|$)'
run_grep "document.cookie"           'document\.cookie'
run_grep "access_token"              'access_token'

# ---- Design-system color gate (docs/DESIGN-SYSTEM.md) -----------------------
# Own scope: components must read 1health tokens, never raw colors. Like the
# checks above, grep errors go to /dev/null; scripts/check-forbidden.test.ts
# (run in CI) is the guard that these patterns still match.
COLOR_DIRS=()
for d in app components features; do
  [ -d "$d" ] && COLOR_DIRS+=("$d")
done

run_color_grep() {
  local label="$1" pattern="$2" matches
  [ "${#COLOR_DIRS[@]}" -eq 0 ] && return 0
  # app/globals.css (exactly that path) is the token source; test files hold
  # fixtures. Everything else in scope is checked, whatever its file type.
  matches=$(grep -rnE --binary-files=without-match \
    --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next \
    --exclude='*.test.*' \
    "$pattern" "${COLOR_DIRS[@]}" 2>/dev/null | grep -vE '^(\./)?app/globals\.css:' || true)
  if [ -n "$matches" ]; then
    echo "FORBIDDEN [$label]:"
    echo "$matches"
    echo
    fail=1
  fi
}

# A color-utility prefix (after a non-word char: start, quote, space, a variant
# `:` or a `-` as in drop-shadow-/inset-ring-), then a Tailwind palette name with
# an optional -<shade>, then the end of the class (`/` opacity, space, quote...).
COLOR_PREFIX='(bg|text|border(-(x|y|t|r|b|l|s|e))?|ring-offset|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|accent|caret|shadow)'
PALETTE='(black|white|slate|gray|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)'

run_color_grep "hex color"           '#[0-9a-fA-F]{3,8}\b'
run_color_grep "Tailwind palette"    "(^|[^A-Za-z0-9_])${COLOR_PREFIX}-(${PALETTE}(-[0-9]+)?|neutral-[0-9]+)([^A-Za-z0-9_-]|\$)"

if [ "$fail" -ne 0 ]; then
  echo "check-forbidden: forbidden patterns found." >&2
  exit 1
fi

echo "check-forbidden: clean."
