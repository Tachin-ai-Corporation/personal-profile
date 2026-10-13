#!/usr/bin/env bash
#
# Forbidden-pattern gate (AD-1, AD-20).
#
# Fails if any of these appear in CLIENT source:
#   - NEXT_PUBLIC_*SECRET*            (secrets must never be public)
#   - secret-ish names ending _DEMO / _PROD  (one deployment per env; AD-3)
#   - document.cookie                 (tokens live only in the sealed cookie; AD-1)
#   - access_token                    (tokens never reach the browser; AD-1)
#
# Scope: the source dirs below, excluding lib/server (the only place that may
# read env/secrets), this script, and build/VCS/vendor trees. Runs in CI and
# locally: `bash scripts/check-forbidden.sh`.
set -euo pipefail

# Run from the repo root regardless of where the script is invoked.
cd "$(dirname "$0")/.."

SRC_DIRS=(app components contexts hooks features lib)

# Keep only the source dirs that currently exist.
EXISTING=()
for d in "${SRC_DIRS[@]}"; do
  [ -d "$d" ] && EXISTING+=("$d")
done

if [ "${#EXISTING[@]}" -eq 0 ]; then
  echo "check-forbidden: no source directories to scan."
  exit 0
fi

fail=0

run_grep() {
  local label="$1" pattern="$2" matches
  # Scan every source dir, then drop matches under lib/server (and only there —
  # the one allowed secret reader). A path-anchored filter, so a future
  # app/server or components/server stays in scope.
  matches=$(grep -rnE --binary-files=without-match \
    --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next \
    --exclude="check-forbidden.sh" \
    "$pattern" "${EXISTING[@]}" 2>/dev/null | grep -vE '^(\./)?lib/server/' || true)
  if [ -n "$matches" ]; then
    echo "FORBIDDEN [$label]:"
    echo "$matches"
    echo
    fail=1
  fi
}

run_grep "NEXT_PUBLIC_*SECRET*"      'NEXT_PUBLIC_[A-Za-z0-9_]*SECRET'
run_grep "_DEMO/_PROD secret name"   '[A-Z][A-Z0-9_]*_(DEMO|PROD)([^A-Za-z0-9_]|$)'
run_grep "document.cookie"           'document\.cookie'
run_grep "access_token"              'access_token'

if [ "$fail" -ne 0 ]; then
  echo "check-forbidden: forbidden patterns found." >&2
  exit 1
fi

echo "check-forbidden: clean."
