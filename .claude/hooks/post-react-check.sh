#!/usr/bin/env bash
#
# Claude Code PostToolUse hook (matcher: Write|Edit|MultiEdit) — after every .ts/.tsx/.js/.jsx/.mjs/.cjs edit:
#   1. eslint --fix + prettier --write   (silent auto-fix)
#   2. eslint on what could not be auto-fixed -> reported back to Claude (exit 2)
#   3. tsc --noEmit for the project, filtered to the edited file (set TS_CHECK=0 to skip; 60s cap when
#      `timeout`/`gtimeout` exists). Only .ts/.tsx files are type-checked.
#
# Tools come from the project (node_modules/.bin, or the package manager's `exec` without installing).
# A missing tool is skipped silently — the hook never blocks work just because the environment isn't
# set up yet. Findings are fed back so the agent fixes them in the same turn; CI stays authoritative.
# Requires: jq.
set -o pipefail

input="$(cat)"
f="$(jq -r '.tool_response.filePath // .tool_input.file_path // empty' <<<"$input" 2>/dev/null)"
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"
case "$f" in *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.mts|*.cts) ;; *) exit 0 ;; esac
[[ -f "$f" ]] || exit 0
case "$f" in */node_modules/*|*/dist/*|*/build/*|*/coverage/*|*.d.ts|*.gen.ts|*/generated/*) exit 0 ;; esac
proj="${CLAUDE_PROJECT_DIR:-${cwd:-$PWD}}"
cd "$proj" 2>/dev/null || exit 0
# shellcheck source=lib-js.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib-js.sh"

run_js_tool eslint --fix "$f" >/dev/null 2>&1          # fix first (may drop imports) ...
run_js_tool prettier --write "$f" >/dev/null 2>&1      # ... then format

report=""
out="$(run_js_tool eslint --format unix "$f" 2>&1)"; rc=$?
if [[ $rc -ne 0 && $rc -ne 127 && -n "$out" ]]; then
  report="${report}eslint (not auto-fixable):"$'\n'"$(head -25 <<<"$out")"$'\n'
fi

if [[ "${TS_CHECK:-1}" != "0" ]]; then
  case "$f" in
    *.ts|*.tsx|*.mts|*.cts)
      if cfg="$(ts_project)"; then
        rel="${f#"$PWD"/}"
        to="$(command -v timeout || command -v gtimeout || true)"
        if [[ -n "$to" ]]; then out="$("$to" 60 bash -c "$(declare -f run_js_tool); cd \"$PWD\"; run_js_tool tsc --noEmit --pretty false -p \"$cfg\"" 2>&1)"; rc=$?
        else out="$(run_js_tool tsc --noEmit --pretty false -p "$cfg" 2>&1)"; rc=$?; fi
        if [[ $rc -ne 0 && $rc -ne 127 && $rc -ne 124 ]]; then
          mine="$(grep -F "$rel" <<<"$out" | head -15)"
          [[ -n "$mine" ]] && report="${report}tsc (errors in this file):"$'\n'"$mine"$'\n'
        fi
      fi ;;
  esac
fi

if [[ -n "$report" ]]; then
  { echo "post-react-check: fix these in $f before moving on:"; printf '%s' "$report"; } >&2
  exit 2
fi
exit 0
