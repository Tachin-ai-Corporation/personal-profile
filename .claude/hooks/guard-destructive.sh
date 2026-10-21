#!/usr/bin/env bash
#
# Claude Code PreToolUse hook (matcher: Bash) — blocks shell commands that can destroy
# data or the machine. Exit 2 = block, stderr is shown to Claude.
#
# Blocked:
#   - recursive `rm` of /, $HOME, the project root itself, .git, `*`, `.`, `..`, or any path
#     outside the project (/tmp is allowed)
#   - sudo; chmod -R 777 / a+w; curl|wget piped into a shell; dd to a device; mkfs
#   - global package installs (`npm i -g`, `pnpm add -g`, `yarn global ...`) and `--force`/`--legacy-peer-deps`
#     installs that mask dependency conflicts (use `pnpm add -D <pkg>` / `pnpm exec <tool>` in the project)
#   - git commands that silently discard work: checkout/restore of ".", stash drop/clear,
#     filter-branch/filter-repo, reflog expire, gc --prune=now, update-ref -d
#   (git reset --hard / clean -f / force-push are covered by settings.json deny + guard-git.sh)
#
# Requires: jq, git. Tuned for bash 3.2 (macOS default).
set -f
set -o pipefail

input="$(cat)"
cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)"
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"
[[ -z "$cmd" ]] && exit 0
[[ -n "$cwd" && -d "$cwd" ]] && cd "$cwd"

block() {
  echo "BLOCKED by .claude/hooks/guard-destructive.sh: $1" >&2
  echo "If this is really needed, explain why and ask the user to run it themselves (! <command>)." >&2
  exit 2
}

proj="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
proj="${proj%/}"

# Absolute, ..-collapsed path (symlinks are not resolved).
norm() {
  local p="$1" part IFS=/ out=()
  case "$p" in "~"|"~/"*) p="$HOME${p#\~}" ;; esac
  p="${p//\$\{HOME\}/$HOME}"; p="${p//\$HOME/$HOME}"
  case "$p" in /*) ;; *) p="$PWD/$p" ;; esac
  for part in $p; do
    case "$part" in
      ""|".") ;;
      "..") [[ ${#out[@]} -gt 0 ]] && unset "out[$((${#out[@]} - 1))]" ;;
      *) out+=("$part") ;;
    esac
  done
  if [[ ${#out[@]} -eq 0 ]]; then printf '/'; else printf '/%s' "${out[@]}"; fi
}

inside_project() { [[ "$1" == "$proj"/* ]]; }
allowed_tmp()    { case "$1" in /tmp/*|/private/tmp/*|/var/folders/*|/private/var/folders/*) return 0 ;; esac; return 1; }

check_rm_target() {
  local raw="$1" t n
  t="${raw//[\"\']/}"
  [[ -z "$t" ]] && return 0
  case "$t" in
    '$HOME'*|'${HOME}'*) ;;
    '$'*) block "rm -r on '$raw' — a path built from an unresolved variable cannot be verified." ;;
  esac
  case "$t" in
    '*'|'./*'|'.*') n="$PWD" ;;
    *) n="$(norm "${t%/\*}")" ;;
  esac
  n="${n%/}"; [[ -z "$n" ]] && n="/"
  [[ "$n" == "/" ]] && block "rm -r on the filesystem root."
  [[ "$n" == "${HOME%/}" ]] && block "rm -r on the home directory."
  [[ "$n" == "$proj" ]] && block "rm -r on the project root itself ('$raw')."
  [[ "$n" == "$proj/.git" || "$n" == "$proj/.git/"* ]] && block "rm -r inside .git."
  inside_project "$n" && return 0
  allowed_tmp "$n" && return 0
  block "rm -r on '$raw', which resolves outside the project ($n)."
}

# One shell "segment" at a time (split on ; & | and newlines).
while IFS= read -r seg; do
  # shellcheck disable=SC2206
  toks=($seg)
  [[ ${#toks[@]} -eq 0 ]] && continue
  i=0
  while [[ $i -lt ${#toks[@]} ]]; do
    case "${toks[$i]}" in sudo|command|env|nohup|time|exec|*=*) i=$((i + 1)) ;; *) break ;; esac
  done
  [[ $i -ge ${#toks[@]} ]] && continue
  first="${toks[$i]##*/}"

  if [[ "$first" == "rm" ]]; then
    recursive=0; targets=(); endopts=0
    for ((j = i + 1; j < ${#toks[@]}; j++)); do
      t="${toks[$j]}"
      if [[ $endopts -eq 0 && "$t" == "--" ]]; then endopts=1; continue; fi
      if [[ $endopts -eq 0 && "$t" == -* ]]; then
        case "$t" in --recursive) recursive=1 ;; --*) ;; *[rR]*) recursive=1 ;; esac
        continue
      fi
      targets+=("$t")
    done
    if [[ $recursive -eq 1 ]]; then
      for t in "${targets[@]}"; do check_rm_target "$t"; done
    fi
  fi

  # global installs / conflict-masking installs
  case "$first" in
    npm|pnpm|yarn|bun)
      sub="${toks[$((i + 1))]:-}"
      case "$sub" in
        install|i|add|link|ln)
          case " $seg " in
            *" -g "*|*" --global "*|*" --location=global "*) block "global package install modifies the machine, not the project. Add it as a devDependency and run it with '$first exec <tool>'." ;;
          esac
          case " $seg " in
            *" --force "*|*" -f "*|*" --legacy-peer-deps "*) block "'$first $sub --force/--legacy-peer-deps' masks dependency conflicts. Resolve the peer-dependency conflict (or ask the user to run it)." ;;
          esac ;;
        global) block "global package changes are not allowed for the agent." ;;
      esac ;;
  esac
done < <(tr ';&|' '\n\n\n' <<<"$cmd")

grep -Eq '(^|[;&|[:space:]])sudo([[:space:]]|$)' <<<"$cmd" && block "sudo is not allowed for the agent."
grep -Eq 'chmod[^;&|]*(-R|--recursive)[^;&|]*(777|a\+w|o\+w)|chmod[[:space:]]+(-[a-zA-Z]+[[:space:]]+)?(777|a\+rwx)[[:space:]]+/' <<<"$cmd" && block "world-writable chmod."
grep -Eq '(curl|wget)[^;&]*\|[[:space:]]*(sudo[[:space:]]+)?(ba|z|da|k)?sh([[:space:]]|$)|(ba|z)?sh[[:space:]]+-c[[:space:]]+"?\$\((curl|wget)' <<<"$cmd" && block "piping a download into a shell. Download, review, then run."
grep -Eq '(^|[[:space:];&|])dd[[:space:]][^;&|]*of=/dev/|(^|[[:space:];&|])mkfs(\.[a-z0-9]+)?[[:space:]]|>[[:space:]]*/dev/(sd|nvme|disk)|:\(\)[[:space:]]*\{' <<<"$cmd" && block "raw device writes / fork bomb."

git_sub() { grep -Eq "(^|[^[:alnum:]_-])git([[:space:]]+(-C|-c)[[:space:]]+[^[:space:]]+)*[[:space:]]+$1([[:space:]]|\$)" <<<"$cmd"; }
if git_sub checkout && grep -Eq 'checkout[[:space:]]+(--[[:space:]]+)?\.([[:space:]]|$)|checkout[[:space:]]+--[[:space:]]+\*' <<<"$cmd"; then block "'git checkout .' discards every uncommitted change."; fi
if git_sub restore && grep -Eq 'restore[^;&|]*[[:space:]]\.([[:space:]]|$)' <<<"$cmd"; then block "'git restore .' discards every uncommitted change."; fi
git_sub stash && grep -Eq 'stash[[:space:]]+(drop|clear)' <<<"$cmd" && block "dropping stashes loses work irrecoverably."
{ git_sub filter-branch || git_sub filter-repo; } && block "history rewriting."
git_sub reflog && grep -Eq 'reflog[[:space:]]+(expire|delete)' <<<"$cmd" && block "expiring the reflog removes the safety net."
git_sub gc && grep -Eq -- '--prune=now' <<<"$cmd" && block "gc --prune=now permanently deletes unreachable objects."
git_sub update-ref && grep -Eq 'update-ref[[:space:]]+-d' <<<"$cmd" && block "deleting refs directly."
exit 0
