#!/usr/bin/env bash
# Shared helper sourced by the post-react-check / stop-gate hooks (not a hook itself, never wired in
# settings.json). Resolves a JS tool from the project: node_modules/.bin first, then the project's
# package manager (`pnpm exec` / `npm exec --no` / `yarn`), never a network download.
# Returns 127 when the tool is not available so callers can skip silently.

run_js_tool() {
  local t="$1"; shift
  if [[ -x "node_modules/.bin/$t" ]]; then "node_modules/.bin/$t" "$@"
  elif [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1 && [[ -d node_modules ]]; then pnpm exec --no-install "$t" "$@" 2>/dev/null || return 127
  elif [[ -f yarn.lock ]] && command -v yarn >/dev/null 2>&1 && [[ -d node_modules ]]; then yarn --silent "$t" "$@"
  elif command -v npm >/dev/null 2>&1 && [[ -d node_modules ]]; then npm exec --no --silent -- "$t" "$@" 2>/dev/null || return 127
  else return 127; fi
}

# Does the project define a tsconfig the type-check can use?
ts_project() {
  local c
  for c in tsconfig.app.json tsconfig.json; do [[ -f "$c" ]] && { printf '%s' "$c"; return 0; }; done
  return 1
}
