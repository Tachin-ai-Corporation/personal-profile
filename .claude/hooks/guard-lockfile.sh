#!/usr/bin/env bash
#
# Claude Code PreToolUse hook (matcher: Edit|Write|MultiEdit) — protects generated files from hand edits.
# Exit 2 = block, stderr is shown to Claude.
#
# Blocked:
#   - pnpm-lock.yaml, package-lock.json, npm-shrinkwrap.json, yarn.lock, bun.lock, bun.lockb
#     -> regenerate with the package manager (`pnpm add/remove/update`, `pnpm install --lockfile-only`)
#   - generated API clients/route trees: *.gen.ts(x), routeTree.gen.ts, files under a `generated/` or
#     `__generated__/` directory, and files whose first lines say "auto-generated"/"DO NOT EDIT"
#     -> change the spec/source and re-run the generator (openapi-typescript, orval, graphql-codegen, TanStack Router)
#
# Limitation: this inspects Edit/Write only; a `sed -i pnpm-lock.yaml` via Bash is not caught.
# Requires: jq.
set -o pipefail

input="$(cat)"
path="$(jq -r '.tool_input.file_path // empty' <<<"$input" 2>/dev/null)"
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"
[[ -z "$path" ]] && exit 0
[[ -n "$cwd" && -d "$cwd" ]] && cd "$cwd"

block() {
  echo "BLOCKED by .claude/hooks/guard-lockfile.sh: $1" >&2
  exit 2
}

case "${path##*/}" in
  pnpm-lock.yaml)          block "pnpm-lock.yaml is generated. Change dependencies with 'pnpm add/remove/update', never by hand." ;;
  package-lock.json|npm-shrinkwrap.json) block "${path##*/} is generated. Use 'npm install/uninstall <pkg>'." ;;
  yarn.lock)               block "yarn.lock is generated. Use 'yarn add/remove'." ;;
  bun.lock|bun.lockb)      block "${path##*/} is generated. Use 'bun add/remove'." ;;
  *.gen.ts|*.gen.tsx|routeTree.gen.ts) block "'${path##*/}' is generated code. Change its source (OpenAPI spec / route files / schema) and re-run the generator." ;;
esac

case "$path" in
  */generated/*|*/__generated__/*)
    block "'$path' lives in a generated directory. Change the source and re-run the generator (see package.json scripts)." ;;
esac

# Existing file that declares itself generated.
if [[ -f "$path" ]] && head -n 5 "$path" 2>/dev/null | grep -Eiq 'auto-?generated|do not (edit|modify)|@generated'; then
  block "'$path' declares itself generated (DO NOT EDIT). Change the source and re-run the generator."
fi
exit 0
