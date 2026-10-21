#!/usr/bin/env bash
#
# Claude Code Stop hook — OPT-IN quality gate. Before Claude declares a task finished, run the
# project's fast checks over the working tree and, if any fail, block the stop (exit 2) so the
# agent keeps working until it is green ("not done until green" — CLAUDE.md § Test coverage requirement).
#
# Enable per developer/session:   export CLAUDE_STOP_GATE=1
# Runs only when TS/JS/package files changed (git status). Checks, each skipped if not configured:
#   eslint . · tsc --noEmit · vitest run --changed (if vitest is installed)
# Loop-safe: if the previous stop was already blocked by this hook, it lets go (exit 0).
# Requires: jq, git.
set -o pipefail

[[ "${CLAUDE_STOP_GATE:-0}" == "1" ]] || exit 0

input="$(cat)"
[[ "$(jq -r '.stop_hook_active // false' <<<"$input" 2>/dev/null)" == "true" ]] && exit 0
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"
proj="${CLAUDE_PROJECT_DIR:-${cwd:-$PWD}}"
cd "$proj" 2>/dev/null || exit 0
# shellcheck source=lib-js.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib-js.sh"

changed="$(git status --porcelain 2>/dev/null | awk '{print $NF}' | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$|(^|/)package\.json$|(^|/)tsconfig[^/]*\.json$' || true)"
[[ -z "$changed" ]] && exit 0

fail=""
step() {  # $1 = label, rest = tool + args
  local label="$1" out rc; shift
  out="$(run_js_tool "$@" 2>&1)"; rc=$?
  if [[ $rc -ne 0 && $rc -ne 127 ]]; then
    fail="${fail}--- ${label} (exit ${rc}) ---"$'\n'"$(tail -25 <<<"$out")"$'\n'
  fi
}

if ls eslint.config.* >/dev/null 2>&1 || ls .eslintrc* >/dev/null 2>&1; then step "eslint" eslint .; fi
if cfg="$(ts_project)"; then step "tsc --noEmit" tsc --noEmit --pretty false -p "$cfg"; fi
if [[ -x node_modules/.bin/vitest ]]; then step "vitest" vitest run --changed --passWithNoTests; fi

if [[ -n "$fail" ]]; then
  { echo "stop-gate: the working tree is not green — keep going until these pass (CLAUDE_STOP_GATE=1):"; printf '%s' "$fail"; } >&2
  exit 2
fi
exit 0
