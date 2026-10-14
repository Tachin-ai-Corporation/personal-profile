#!/usr/bin/env bash
#
# Forbidden-pattern gate (AD-1, AD-20, D1, D10).
#
# Fails if any of these appear in CLIENT source (app code outside lib/server):
#   - NEXT_PUBLIC_*SECRET*            (secrets must never be public)
#   - document.cookie                 (tokens live only in the sealed cookie; AD-1)
#   - access_token                    (tokens never reach the browser; AD-1)
#
# Fails if a name ending _DEMO / _PROD (the per-environment secrets, D1) appears
# anywhere in code other than lib/server/env.ts, its tests, .env.example and the
# CI/test fixtures (.github/workflows/ci.yml, playwright.config.ts, test/,
# e2e/fixtures.ts, vitest.setup.ts).
#
# Fails, in app code (the source dirs incl. lib/server, plus the root proxy.ts
# and instrumentation.ts; *.test.* and e2e/ excluded), on the symbols the
# 2026-10-14 decisions removed: APP_ENV, API_ORIGIN, APP_ORIGIN, PORTAL_URL,
# PORTAL_ORIGIN, PUBLIC_FILES_ORIGIN (D1, D4: origins live only in
# lib/shared/environments.ts), SameSite=None, Partitioned, window.top (D10:
# never framed) and bg-black/50 (D13: use the scrim token). Later rework
# stories add their own bans (X-PP-Session, sessionBinding) as they remove them.
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
# Root-level app files (the request interceptor and the boot hook).
ROOT_APP_FILES=(proxy.ts instrumentation.ts)

# Keep only the source dirs / files that currently exist.
EXISTING=()
for d in "${SRC_DIRS[@]}"; do
  [ -d "$d" ] && EXISTING+=("$d")
done
for f in "${ROOT_APP_FILES[@]}"; do
  [ -f "$f" ] && EXISTING+=("$f")
done

# Code outside app code that the _DEMO/_PROD rule also covers.
EXTRA=()
for p in e2e test scripts .github .env.example playwright.config.ts vitest.config.ts vitest.setup.ts next.config.mjs eslint.config.mjs; do
  [ -e "$p" ] && EXTRA+=("$p")
done

if [ "${#EXISTING[@]}" -eq 0 ] && [ "${#EXTRA[@]}" -eq 0 ]; then
  echo "check-forbidden: no source directories to scan."
  exit 0
fi

fail=0

report() {
  local label="$1" matches="$2"
  if [ -n "$matches" ]; then
    echo "FORBIDDEN [$label]:"
    echo "$matches"
    echo
    fail=1
  fi
}

grep_paths() {
  local pattern="$1"
  shift
  # No paths: nothing to scan (and never let grep fall back to stdin).
  [ "$#" -eq 0 ] && return 0
  grep -rnE --binary-files=without-match \
    --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next \
    --exclude="check-forbidden.sh" \
    "$pattern" "$@" 2>/dev/null || true
}

run_grep() {
  local label="$1" pattern="$2" matches
  # Scan app code, then drop matches under lib/server (and only there — the one
  # allowed secret reader). A path-anchored filter, so a future app/server or
  # components/server stays in scope.
  matches=$(grep_paths "$pattern" ${EXISTING[@]+"${EXISTING[@]}"} | grep -vE '^(\./)?lib/server/' || true)
  report "$label" "$matches"
}

run_grep "NEXT_PUBLIC_*SECRET*"      'NEXT_PUBLIC_[A-Za-z0-9_]*SECRET'
run_grep "document.cookie"           'document\.cookie'
run_grep "access_token"              'access_token'

# ---- Per-environment secret names (D1) --------------------------------------
# Allowed only in lib/server/env.ts, its tests, .env.example and CI/test
# fixtures. Everything else in app code, e2e/, test/ and tooling is checked.
DEMO_PROD_ALLOWED='^(\./)?(lib/server/env\.ts|lib/server/env\.test\.ts|\.env\.example|\.github/workflows/ci\.yml|playwright\.config\.ts|vitest\.setup\.ts|e2e/fixtures\.ts|test/[^:]*):'
matches=$(grep_paths '[A-Z][A-Z0-9_]*_(DEMO|PROD)([^A-Za-z0-9_]|$)' ${EXISTING[@]+"${EXISTING[@]}"} ${EXTRA[@]+"${EXTRA[@]}"} \
  | grep -vE "$DEMO_PROD_ALLOWED" || true)
report "_DEMO/_PROD secret name" "$matches"

# ---- Removed symbols (D1, D4, D10, D13) -------------------------------------
# App code including lib/server; test files hold fixtures and are skipped.
run_app_grep() {
  local label="$1" pattern="$2" matches
  [ "${#EXISTING[@]}" -eq 0 ] && return 0
  matches=$(grep -rnE --binary-files=without-match \
    --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next \
    --exclude="check-forbidden.sh" --exclude='*.test.*' \
    "$pattern" "${EXISTING[@]}" 2>/dev/null || true)
  report "$label" "$matches"
}

# A left boundary of "not a letter or digit" also catches NEXT_PUBLIC_APP_ENV.
run_app_grep "removed env/origin name" '(^|[^A-Za-z0-9])(APP_ENV|API_ORIGIN|APP_ORIGIN|PORTAL_URL|PORTAL_ORIGIN|PUBLIC_FILES_ORIGIN)([^A-Za-z0-9_]|$)'
run_app_grep "SameSite=None"         'SameSite=None'
run_app_grep "Partitioned"           'Partitioned'
run_app_grep "window.top"            'window\.top([^A-Za-z0-9_]|$)'
run_app_grep "bg-black/50"           'bg-black/50'

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
