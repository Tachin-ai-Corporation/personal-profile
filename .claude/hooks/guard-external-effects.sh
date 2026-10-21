#!/usr/bin/env bash
#
# Claude Code PreToolUse hook (matcher: Bash) — asks the user before a command that has an
# effect OUTSIDE the machine (publishes, deploys, writes to a remote API/DB, sends data).
# It does not block: it returns permissionDecision "ask", so the user approves or denies
# each one. This is the enforcement behind "dry-run first" for scripts that push/publish.
#
# Asks on:
#   - curl/wget/httpie with a write verb or a body (-X POST/PUT/PATCH/DELETE, -d, -F, -T, --json)
#   - gh pr|release|issue|repo|workflow|secret ... create/merge/close/delete/edit/run/..., gh api writes
#   - aws mutating verbs (create/delete/put/update/terminate/invoke/send/publish/cp/sync/rm/mv/...)
#   - docker push/login, kubectl apply/delete/patch/..., helm, terraform apply/destroy, pulumi,
#     cdk/serverless deploy
#   - npm/pnpm/yarn/bun publish, npm dist-tag/deprecate/unpublish/access/owner, changeset publish
#   - front-end deploys: vercel, netlify, wrangler (Cloudflare), firebase deploy, amplify, surge, sentry-cli releases/sourcemaps upload,
#     chromatic, storybook publish
#   - SQL writes through psql/mysql/sqlite3/mongosh (DROP/TRUNCATE/DELETE/UPDATE/INSERT/ALTER/GRANT)
#   - prisma migrate deploy/db push, drizzle-kit push/migrate, supabase db push
#   - scp/rsync/sftp
#   - anything matching $EXTERNAL_EFFECT_PATTERNS_EXTRA (extended regex), e.g. 'deploy:prod|release:publish'
#
# `git push` is handled separately (settings.json "ask" + guard-git.sh).
# Requires: jq.
set -o pipefail

input="$(cat)"
cmd="$(jq -r '.tool_input.command // empty' <<<"$input" 2>/dev/null)"
[[ -z "$cmd" ]] && exit 0

ask() {
  jq -n --arg r "guard-external-effects: $1 — confirm this is intended (is there a --dry-run/read-only variant to try first?)." \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
}
m() { grep -Eiq "$1" <<<"$cmd"; }

S='(^|[;&|[:space:](])'     # start of a command word

if m "${S}(curl|wget|http|https|xh)[[:space:]]"; then
  m '(-X|--request)[[:space:]=]*(POST|PUT|PATCH|DELETE)|--method[[:space:]=]*(POST|PUT|PATCH|DELETE)|[[:space:]](-d|-F|-T|--data(-raw|-binary|-urlencode|-ascii)?|--form|--upload-file|--json|--post-data|--post-file)([[:space:]=]|$)' \
    && ask "an HTTP request that sends data / uses a write verb"
fi
m "${S}gh[[:space:]]+(pr|release|issue|repo|workflow|secret|variable|label|gist)[[:space:]]+(create|merge|close|delete|edit|run|comment|review|reopen|set|remove|ready|rename|archive|fork)" && ask "a GitHub write operation"
if m "${S}gh[[:space:]]+api[[:space:]]"; then
  m '(-X|--method)[[:space:]=]*(POST|PUT|PATCH|DELETE)|[[:space:]](-f|-F|--field|--raw-field|--input)([[:space:]=]|$)' && ask "a GitHub API write"
fi
m "${S}aws[[:space:]]+s3[[:space:]]+(cp|sync|rm|mv|rb|mb)[[:space:]]" && ask "an AWS S3 write"
m "${S}aws[[:space:]]+([a-z0-9-]+[[:space:]]+)+(create|delete|put|update|terminate|run|invoke|send|publish|start|stop|deregister|register|modify|attach|detach|deploy|remove|add|set|reset|restore|revoke|authorize)[a-z0-9-]*" && ask "an AWS mutating call"
m "${S}docker[[:space:]]+(compose[[:space:]]+)?(push|login)" && ask "a container registry push/login"
m "${S}kubectl[[:space:]]+(apply|delete|patch|replace|scale|rollout|create|edit|exec|drain|cordon|label|annotate)" && ask "a Kubernetes mutating command"
m "${S}helm[[:space:]]+(install|upgrade|uninstall|rollback)" && ask "a Helm release change"
m "${S}(terraform|tofu)[[:space:]]+(apply|destroy|import|taint|state[[:space:]]+(rm|mv))" && ask "infrastructure changes (terraform)"
m "${S}pulumi[[:space:]]+(up|destroy|refresh)|${S}(cdk|sls|serverless)[[:space:]]+(deploy|destroy|remove)" && ask "a cloud deployment"
m "${S}(npm|pnpm|yarn|bun)[[:space:]]+(publish|dist-tag|deprecate|unpublish|access|owner|token|login|adduser)|${S}(yarn[[:space:]]+npm|pnpm)[[:space:]]+(publish|login)|${S}(changeset|changesets)[[:space:]]+publish|${S}(npm|pnpm)[[:space:]]+run[[:space:]]+(publish|release|deploy)[a-z:_-]*" && ask "publishing a package / a deploy-or-release script"
m "${S}(vercel|netlify|wrangler|firebase|amplify|surge|chromatic)[[:space:]]+(deploy|--prod|publish|pages[[:space:]]+deploy|hosting|link|env[[:space:]]+(add|rm|pull))|${S}(npx|pnpm[[:space:]]+dlx|pnpm[[:space:]]+exec)[[:space:]]+(vercel|netlify|wrangler|firebase|chromatic)[[:space:]]" && ask "a front-end hosting deploy/environment change"
m "${S}sentry-cli[[:space:]]+(releases|sourcemaps|upload|deploys)" && ask "uploading releases/source maps to Sentry"

if m "${S}(psql|mysql|mariadb|sqlite3|sqlcmd|mongosh|redis-cli)[[:space:]]"; then
  m '\b(DROP|TRUNCATE|DELETE[[:space:]]+FROM|UPDATE[[:space:]]+[A-Za-z_."]+[[:space:]]+SET|INSERT[[:space:]]+INTO|ALTER|GRANT|REVOKE|CREATE[[:space:]]+(TABLE|INDEX|DATABASE)|FLUSHALL|FLUSHDB|DEL)\b' && ask "a database write/DDL through a CLI client"
fi
m "${S}(prisma|drizzle-kit|supabase|knex|typeorm|sequelize)[[:space:]]+(migrate[[:space:]]+(deploy|reset|dev)|db[[:space:]]+(push|reset|execute)|push|migrate|migration:run|migration:revert|db:migrate)" && ask "a database migration/push against whatever database the environment points at"
m "${S}(scp|rsync|sftp)[[:space:]]" && ask "a file transfer to/from a remote host"
if [[ -n "${EXTERNAL_EFFECT_PATTERNS_EXTRA:-}" ]] && grep -Eiq "$EXTERNAL_EFFECT_PATTERNS_EXTRA" <<<"$cmd"; then
  ask "a command matching this project's EXTERNAL_EFFECT_PATTERNS_EXTRA"
fi
exit 0
