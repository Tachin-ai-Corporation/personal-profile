#!/usr/bin/env bash
#
# Claude Code SessionStart hook — prints a short orientation (stdout is added to Claude's context):
# branch (and a warning if it is protected), detected project profile, package manager, Node version vs
# .nvmrc, installed standards version, whether git hooks / lockfile / node_modules are in place.
# Never fails the session.
set -o pipefail

proj="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$proj" 2>/dev/null || exit 0

branch="$(git branch --show-current 2>/dev/null || true)"
echo "Session context (from .claude/hooks/session-info.sh):"
if [[ -n "$branch" ]]; then
  case "$branch" in
    main|master) echo "- Branch: $branch — PROTECTED. Create a feature branch before committing (git switch -c feat/<ticket>-<slug>)." ;;
    *) echo "- Branch: $branch" ;;
  esac
fi

deps="$(cat package.json 2>/dev/null || true)"
if [[ -z "$deps" ]]; then
  profile="unknown — no package.json here"
elif grep -Eq '"(next|@react-router/dev|@tanstack/react-start|@remix-run/dev)"' <<<"$deps"; then
  profile="Framework app (Server Components/actions rules apply — CLAUDE.md § Framework apps)"
elif grep -Eq '"peerDependencies"[^}]*"react"' <<<"$(tr -d '\n' <<<"$deps")" && [[ ! -f index.html ]]; then
  profile="Library / package (CLAUDE.md § Libraries and packages)"
else
  profile="Vite SPA (default)"
fi
echo "- Detected profile: $profile — confirm per package (CLAUDE.md § Project profiles)."

pm="npm"
[[ -f pnpm-lock.yaml ]] && pm="pnpm"; [[ -f yarn.lock ]] && pm="yarn"; [[ -f bun.lock || -f bun.lockb ]] && pm="bun"
echo "- Package manager: $pm (use only this one)."
if [[ -f .nvmrc ]] && command -v node >/dev/null 2>&1; then
  want="$(tr -d 'v[:space:]' < .nvmrc)"; have="$(node -v | tr -d 'v')"
  [[ "${have%%.*}" == "${want%%.*}" ]] || echo "- WARNING: Node $have is active but .nvmrc asks for $want."
fi

ver="$(cat .claude/.react-standards-version 2>/dev/null || true)"
[[ -n "$ver" ]] && echo "- Standards: template v${ver} (re-run install.sh from a fresh pull of dev-std-ai-agents-and-skills to update)"

if [[ -d .git ]]; then
  [[ -n "$(git config core.hooksPath 2>/dev/null)" || -x .git/hooks/pre-commit ]] || echo "- WARNING: git hooks are not active here (npm install -D husky lint-staged; 'prepare': 'husky'; npm run prepare)."
fi
if [[ -f package.json ]]; then
  [[ -f pnpm-lock.yaml || -f package-lock.json || -f yarn.lock || -f bun.lock || -f bun.lockb ]] || echo "- No lockfile found — dependencies are not pinned."
  [[ -d node_modules ]] || echo "- No node_modules here — run '$pm install' before running tests/tools."
fi
[[ "${CLAUDE_STOP_GATE:-0}" == "1" ]] && echo "- Stop gate is ON: eslint/tsc/vitest must pass before the task can finish."
exit 0
