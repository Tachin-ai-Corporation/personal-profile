#!/usr/bin/env bash
#
# Claude Code PreToolUse hook (matcher: Bash) — blocks the git operations an AI
# agent must never do on its own. Exit code 2 = block, stderr is shown to Claude.
#
# Blocked:
#   - git commit / git push while on a protected branch (main, master)
#   - git push to a protected branch from anywhere (git push origin HEAD:main)
#   - force pushes (--force, -f, --force-with-lease, +refspec)
#   - bypassing local hooks: --no-verify, HUSKY=0, HUSKY_SKIP_HOOKS, core.hooksPath,
#     `husky uninstall`, deleting/chmod-ing .husky or .git/hooks
#
# This is the *Claude Code* layer. The tool-agnostic layer (Codex, Gemini,
# humans) is the .husky/ hooks; the unbypassable layer is Bitbucket branch
# restrictions on the server. See CLAUDE.md § Git workflow and guardrails.
#
# Requires: jq, git.
set -uo pipefail

PROTECTED_BRANCHES="${PROTECTED_BRANCHES:-main master}"

input="$(cat)"
cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)"
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"
[[ -z "$cmd" ]] && exit 0
[[ -n "$cwd" && -d "$cwd" ]] && cd "$cwd"

block() {
  echo "BLOCKED by .claude/hooks/guard-git.sh: $1" >&2
  echo "Do the work on a feature branch and open a pull request; ask the user to run this themselves if it is truly needed." >&2
  exit 2
}

# `git`, optionally followed by global options (-C <path>, -c <k=v>), then <sub>.
git_sub() { grep -Eq "(^|[^[:alnum:]_-])git([[:space:]]+(-C|-c)[[:space:]]+[^[:space:]]+)*[[:space:]]+$1([[:space:]]|\$)" <<<"$cmd"; }

is_protected() {
  local b
  for b in $PROTECTED_BRANCHES; do [[ "$1" == "$b" ]] && return 0; done
  return 1
}

current_branch="$(git branch --show-current 2>/dev/null || true)"

# --- hook bypass attempts -----------------------------------------------------
if grep -Eq '(^|[[:space:]])--no-verify([[:space:]]|$)' <<<"$cmd" && { git_sub commit || git_sub push || git_sub merge; }; then
  block "--no-verify skips the commit-msg/pre-commit/pre-push git hooks."
fi
# Quoted strings (commit messages) removed so "-n" inside a message is not a flag.
unquoted="$(sed -E "s/\"[^\"]*\"//g; s/'[^']*'//g" <<<"$cmd")"
if grep -Eq 'git[^|;&]*commit[^|;&]*[[:space:]]-[a-zA-Z]*n[a-zA-Z]*([[:space:]]|$)' <<<"$unquoted"; then
  block "'git commit -n' is --no-verify."
fi
if grep -Eq '(^|[[:space:];&|])(HUSKY|HUSKY_SKIP_HOOKS|SKIP_SIMPLE_GIT_HOOKS)=' <<<"$cmd"; then
  block "HUSKY=0/HUSKY_SKIP_HOOKS= disable the git hooks."
fi
if grep -Eq 'core\.hooksPath|husky[[:space:]]+uninstall|(rm|mv|chmod)[^;&|]*(\.git/hooks|\.husky)' <<<"$cmd"; then
  block "tampering with git hooks."
fi

# --- push ---------------------------------------------------------------------
if git_sub push; then
  if grep -Eq '(^|[[:space:]])(--force|--force-with-lease(=[^[:space:]]*)?|-f|--mirror|--delete)([[:space:]]|$)|[[:space:]]\+[^[:space:]]+' <<<"$cmd"; then
    block "force/mirror/delete pushes are not allowed."
  fi
  for b in $PROTECTED_BRANCHES; do
    if grep -Eq "[[:space:]:/]$b([[:space:]]|\$)" <<<"$cmd"; then
      block "pushing to protected branch '$b' — go through a pull request."
    fi
  done
  if is_protected "$current_branch"; then
    block "'git push' while on protected branch '$current_branch'."
  fi
fi

# --- commit / merge on a protected branch ------------------------------------
if { git_sub commit || git_sub merge || git_sub cherry-pick || git_sub revert; } && is_protected "$current_branch"; then
  block "committing on protected branch '$current_branch' — create a feature branch first (git switch -c feat/...)."
fi

exit 0
