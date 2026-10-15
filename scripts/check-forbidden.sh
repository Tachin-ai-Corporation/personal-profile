#!/usr/bin/env bash
# CI forbidden-pattern gate (Story 1.1; D1, D5, D10, D13). Exits non-zero on any hit.
#
#   1. `document.cookie` or `access_token` in any file under app/, components/,
#      contexts/, hooks/, features/ or lib/ outside lib/server/ (tests included).
#   2. A `NEXT_PUBLIC_*SECRET*` name anywhere.
#   3. A `_DEMO`/`_PROD`-suffixed secret name outside lib/server/env.ts, its
#      test, .env.example and the CI/test fixtures (D1 keeps those names).
#   4. Removed concepts in app code (tests excluded, since they assert absence):
#      APP_ENV, API_ORIGIN, APP_ORIGIN, PORTAL_URL, PORTAL_ORIGIN,
#      PUBLIC_FILES_ORIGIN, X-PP-Session, sessionBinding, SESSION_CHANGED,
#      Sec-Fetch-Site, SameSite=None, Partitioned, window.top, bg-black/50, and
#      any /launch route.
#   5. A hard-coded 1health origin in app code outside lib/shared/environments.ts
#      (and, in lib/shared/profile-constants.ts, only the exact CHECKOUT_URL
#      line, Story 10.1; spec F6-3: any other 1health URL there still fails).
#   6. `switch-tenant` in app code outside lib/server/proxy/deny-list.ts
#      (Story 7.3, AD-22, R7; spec F7-2): no module references
#      `v2/user/switch-tenant`; the deny rule is the one mention (tests
#      excluded: they assert the deny).
#   7. scripts/check-tokens.sh: hex colors, Tailwind palette classes,
#      text-info-strong on links and bg-error-strong in components/, features/
#      and app/ (outside app/globals.css).
set -euo pipefail

cd "$(dirname "$0")/.."

SELF="scripts/check-forbidden.sh"
status=0

# Tracked and untracked (not ignored) files; planning/docs trees are not code.
files() {
  git ls-files -co --exclude-standard \
    | grep -Ev '^(_bmad/|_bmad-output/|\.claude/|docs/)|\.md$|^pnpm-lock\.yaml$' \
    | grep -Fxv "$SELF" \
    | while IFS= read -r f; do
        [[ -f "$f" ]] || continue
        printf '%s\n' "$f"
      done
}

# report "<message>" "<newline-separated paths>"
report() {
  echo "check-forbidden: $1" >&2
  printf '%s\n' "$2" | sed 's/^/  /' >&2
  status=1
}

# grep -l over a newline-separated file list (NUL-delimited for xargs, so
# spaces in paths are safe); empty list → no hits. Only grep's exit 1 means
# "no match"; any grep error (exit ≥ 2) aborts the check.
hits_in() {
  local list="$1" pattern="$2" rc=0
  [[ -z "$list" ]] && return 0
  printf '%s\n' "$list" | tr '\n' '\0' \
    | xargs -0 sh -c 'grep -lE -- "$0" "$@"; rc=$?; [ "$rc" -le 1 ] || exit 255' "$pattern" || rc=$?
  if [[ $rc -ne 0 ]]; then
    echo "check-forbidden: grep failed (exit $rc) for pattern: $pattern" >&2
    exit 2
  fi
}

all_files=$(files)
app_dirs=$(printf '%s\n' "$all_files" | grep -E '^(app|components|contexts|hooks|features|lib)/|^(proxy|instrumentation)\.ts$' || true)
client_files=$(printf '%s\n' "$app_dirs" | grep -Ev '^lib/server/' || true)
app_code=$(printf '%s\n' "$app_dirs" | grep -Ev '\.test\.tsx?$' || true)

hits=$(hits_in "$client_files" 'document\.cookie')
[[ -n "$hits" ]] && report "document.cookie outside lib/server/:" "$hits"
hits=$(hits_in "$client_files" 'access_token')
[[ -n "$hits" ]] && report "access_token outside lib/server/:" "$hits"

hits=$(hits_in "$all_files" 'NEXT_PUBLIC_[A-Z0-9_]*SECRET')
[[ -n "$hits" ]] && report "NEXT_PUBLIC_*SECRET* name:" "$hits"

ALLOWED_SUFFIXED='^(lib/server/env\.ts|lib/server/env\.test\.ts|test/env-fixture\.ts|\.env\.example|playwright\.config\.ts|e2e/server-env\.ts|\.github/workflows/ci\.yml)$'
hits=$(hits_in "$(printf '%s\n' "$all_files" | grep -Ev "$ALLOWED_SUFFIXED" || true)" '[A-Z0-9_]*(SECRET|KEY|TOKEN|PASSWORD)[A-Z0-9_]*_(DEMO|PROD)\b')
[[ -n "$hits" ]] && report "_DEMO/_PROD secret name outside the allowed files:" "$hits"

REMOVED='\b(APP_ENV|API_ORIGIN|APP_ORIGIN|PORTAL_URL|PORTAL_ORIGIN|PUBLIC_FILES_ORIGIN|SESSION_CHANGED)\b|X-PP-Session|sessionBinding|Sec-Fetch-Site|SameSite=None|Partitioned|window\.top|["'"'"'`]/launch([/?"'"'"'`]|$)'
hits=$(hits_in "$app_code" "$REMOVED")
[[ -n "$hits" ]] && report "removed concept (D1/D5/D10) in app code:" "$hits"
hits=$(hits_in "$app_code" 'bg-black/50')
[[ -n "$hits" ]] && report "bg-black/50 (use the scrim token, D13):" "$hits"
[[ -d app/launch ]] && report "a /launch route exists (D1):" "app/launch"

ORIGIN_RE='https?://[a-z0-9.-]*1health\.io'
PROFILE_CONSTANTS=lib/shared/profile-constants.ts
CHECKOUT_LINE='^export const CHECKOUT_URL = "https://learnmore\.1health\.io/product-checkout"$'
hits=$(hits_in "$(printf '%s\n' "$app_code" | grep -Fxv -e lib/shared/environments.ts -e "$PROFILE_CONSTANTS" || true)" "$ORIGIN_RE")
if [[ -f "$PROFILE_CONSTANTS" ]] && printf '%s\n' "$app_code" | grep -Fxq "$PROFILE_CONSTANTS"; then
  if grep -vE "$CHECKOUT_LINE" "$PROFILE_CONSTANTS" | grep -qE "$ORIGIN_RE"; then
    hits=$(printf '%s\n%s' "$hits" "$PROFILE_CONSTANTS (only the CHECKOUT_URL line may name a 1health URL)" | sed '/^$/d')
  fi
fi
[[ -n "$hits" ]] && report "hard-coded 1health origin outside lib/shared/environments.ts:" "$hits"

# 6. Tenant switching stays denied (Story 7.3): only the deny list names it.
hits=$(hits_in "$(printf '%s\n' "$app_code" | grep -Fxv lib/server/proxy/deny-list.ts || true)" 'switch-tenant')
[[ -n "$hits" ]] && report "switch-tenant outside lib/server/proxy/deny-list.ts (Story 7.3):" "$hits"

# 7. Design tokens (D13): hex colors, palette classes, text-info-strong links, bg-error-strong.
bash scripts/check-tokens.sh || status=1

if [[ $status -eq 0 ]]; then echo "check-forbidden: OK"; fi
exit $status
