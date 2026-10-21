#!/usr/bin/env bash
#
# Claude Code PreToolUse hook (matcher: Read|Edit|Write|Bash) — keeps secrets out of the
# agent's context and out of files. Exit 2 = block, stderr is shown to Claude.
#
# Blocked:
#   - Read/Edit/Write of secret-bearing files: .env, .env.*, *.pem/*.key/*.p12, id_rsa*,
#     ~/.ssh, ~/.aws, ~/.gnupg, .netrc, .npmrc/.yarnrc.yml in $HOME (auth tokens), .pgpass, *.tfvars,
#     service-account*.json, .vercel/ project secrets
#     (templates such as .env.example are allowed)
#   - Bash commands that mention those paths (cat .env, grep -r KEY ~/.aws, git add .env ...)
#     and environment dumps (printenv, bare `env`)
#   - Write/Edit content that contains a secret-shaped value (AWS/GitHub/npm/Anthropic/OpenAI/
#     Slack/Google/Atlassian tokens, private key blocks). Lines containing CHANGE_ME or
#     `pragma: allowlist secret` are ignored — use those for fixtures and placeholders.
#
# Complements (does not replace) gitleaks in .pre-commit-config.yaml and the Read(./.env)
# deny rules in settings.json. Matched secret values are never echoed back.
# Requires: jq.
set -o pipefail

input="$(cat)"
tool="$(jq -r '.tool_name // empty' <<<"$input" 2>/dev/null)"
[[ -z "$tool" ]] && exit 0

block() {
  echo "BLOCKED by .claude/hooks/guard-secrets.sh: $1" >&2
  echo "Secrets must come from the environment/secret store, never from files the agent reads or writes. If you truly need this, ask the user to run it themselves (! <command>)." >&2
  exit 2
}

sensitive_path() {
  local p="$1" base="${1##*/}"
  case "$base" in
    .env.example|.env.sample|.env.template|.env.dist|*.pub) return 1 ;;
    .env|.env.*|*.pem|*.key|*.p12|*.pfx|*.jks|*.keystore|id_rsa|id_rsa.*|id_ed25519|id_ed25519.*|id_ecdsa|id_ecdsa.*|.netrc|.pgpass|.pypirc|.npmrc.local|*.tfvars|service-account*.json) return 0 ;;
  esac
  case "$p" in */.ssh/*|*/.aws/*|*/.gnupg/*|*/.kube/config|*/.docker/config.json|"$HOME"/.npmrc|"$HOME"/.yarnrc.yml|*/.vercel/*) return 0 ;; esac
  return 1
}

case "$tool" in
  Read|Edit|Write|MultiEdit|NotebookEdit)
    path="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input" 2>/dev/null)"
    if [[ -n "$path" ]] && sensitive_path "$path"; then
      block "'$path' is a secret-bearing file (credentials/keys/.env)."
    fi
    if [[ "$tool" == "Write" || "$tool" == "Edit" || "$tool" == "MultiEdit" ]]; then
      content="$(jq -r '[.tool_input.content, .tool_input.new_string, (.tool_input.edits[]?.new_string)] | map(select(. != null)) | join("\n")' <<<"$input" 2>/dev/null)"
      scan="$(grep -vE 'CHANGE_ME|pragma: allowlist secret' <<<"$content")"
      pat='AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|xox[abprs]-[A-Za-z0-9-]{10,}|npm_[A-Za-z0-9]{36}|//[^[:space:]]+/:_authToken=[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|ATATT[A-Za-z0-9_=-]{20,}|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'
      if grep -qE "$pat" <<<"$scan"; then
        block "the content you are writing contains a secret-shaped value (API key/token/private key). Use an environment variable and a CHANGE_ME placeholder in .env.example."
      fi
    fi
    ;;
  Bash)
    cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)"
    [[ -z "$cmd" ]] && exit 0
    # Templates are fine to touch.
    stripped="$(sed -E 's/\.env\.(example|sample|template|dist)//g; s/[^[:space:]]*\.pub//g' <<<"$cmd")"
    if grep -Eq "(^|[[:space:]/=\"'<>])(\.env(\.[A-Za-z0-9_-]+)?|[^[:space:]\"']*\.(pem|p12|pfx|jks|keystore|tfvars)|[^[:space:]\"']*\.key|id_(rsa|ed25519|ecdsa)[^[:space:]\"']*|\.netrc|\.pgpass|\.pypirc)([[:space:]\"';|&)]|\$)|\.ssh/|\.aws/|\.gnupg/|~/\.npmrc|\$HOME/\.npmrc" <<<"$stripped"; then
      block "the command touches a secret-bearing path (.env, keys, ~/.ssh, ~/.aws, ...)."
    fi
    if grep -Eq '(^|[;&|[:space:]])(printenv|export[[:space:]]+-p)([[:space:]]|$|[;&|])|(^|[;&|])[[:space:]]*env[[:space:]]*($|[;&|])' <<<"$cmd"; then
      block "dumping the whole environment would expose secrets; read the single variable you need instead (and never print its value)."
    fi
    ;;
esac
exit 0
