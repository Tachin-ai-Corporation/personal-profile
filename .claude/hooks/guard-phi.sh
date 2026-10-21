#!/usr/bin/env bash
#
# Claude Code PostToolUse hook (matcher: Write|Edit|MultiEdit) — flags PHI/PII-shaped data in
# files the agent just wrote. This is a healthcare platform: fixtures, examples and docs must
# be synthetic. Exit 2 feeds the message back to Claude so it replaces the data immediately.
# (The file is already written; this tells the agent to fix it — the project's real PHI gate,
# e.g. scripts/phi_scan.py in CI/pre-commit, still has the final word.)
#
# Scope (files that commonly carry data): data extensions anywhere (json, csv, tsv, yaml, yml,
# txt, xml, ndjson, jsonl, sql, hl7, fhir), markdown, and anything under fixtures/examples/
# samples/testdata/seed/mock/mocks/stories/__mocks__/__fixtures__ directories or *.stories.* / *.mock.* /
# *.fixture.* files (MSW handlers, Storybook stories). Skipped: .claude/, prompts/, lockfiles.
#
# Detected (only the KIND and line number are reported — values are never echoed):
#   SSN (excluding invalid 000/666/9xx areas and the well-known fakes), labelled MRN,
#   labelled date of birth, US phone numbers (excluding 555-01xx), and — in data files only —
#   email addresses outside example.*/test/invalid/localhost domains.
# Suppress a deliberate synthetic line with the marker `phi-ok` (add a comment saying why).
# Requires: jq.
set -o pipefail

input="$(cat)"
f="$(jq -r '.tool_response.filePath // .tool_input.file_path // empty' <<<"$input" 2>/dev/null)"
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"
[[ -n "$cwd" && -d "$cwd" ]] && cd "$cwd"
[[ -z "$f" || ! -f "$f" ]] && exit 0

case "$f" in */.claude/*|*/prompts/*|*.lock|*/pnpm-lock.yaml|*/package-lock.json|*/node_modules/*|*/dist/*|*/coverage/*|*/playwright-report/*) exit 0 ;; esac

ext="${f##*.}"; ext="$(tr '[:upper:]' '[:lower:]' <<<"$ext")"
data=0; in_scope=0
case "$ext" in json|csv|tsv|yaml|yml|txt|xml|ndjson|jsonl|sql|hl7|fhir) data=1; in_scope=1 ;; md) in_scope=1 ;; esac
case "$f" in */fixtures/*|*/fixture/*|*/examples/*|*/example/*|*/samples/*|*/sample/*|*/testdata/*|*/test_data/*|*/seed/*|*/seeds/*|*/mocks/*|*/mock/*|*/__mocks__/*|*/__fixtures__/*|*/stories/*|*/msw/*|*.stories.*|*.mock.*|*.mocks.*|*.fixture.*|*.fixtures.*) in_scope=1; data=1 ;; esac
[[ $in_scope -eq 0 ]] && exit 0

size="$(wc -c <"$f" | tr -d ' ')"
[[ "$size" -gt 2097152 ]] && exit 0

body="$(grep -nv 'phi-ok' "$f" 2>/dev/null)"
findings=""
# $1 = kind, stdin = grep -n lines; prints one finding per line (run inside $(...), not a pipe-fed global)
report() {
  local ln
  while IFS= read -r ln; do [[ -n "$ln" ]] && printf '%s:%s: looks like %s\n' "$f" "${ln%%:*}" "$1"; done
}

findings+="$(grep -E '(^|[^0-9])[0-9]{3}-[0-9]{2}-[0-9]{4}([^0-9]|$)' <<<"$body" \
  | grep -vE '(^|[^0-9])(000|666|9[0-9]{2})-[0-9]{2}-[0-9]{4}|123-45-6789|111-11-1111|078-05-1120' \
  | report "a US Social Security number")"$'\n'
findings+="$(grep -Ei '\bMRN\b[^0-9A-Za-z]{0,4}[0-9]{5,}|medical[ _-]?record[ _-]?(number|no)[^0-9]{0,4}[0-9]{5,}' <<<"$body" | report "a medical record number")"$'\n'
findings+="$(grep -Ei '(dob|date[ _-]?of[ _-]?birth|birth[ _-]?date|birthdate)[^0-9]{1,6}([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})' <<<"$body" | report "a labelled date of birth")"$'\n'
findings+="$(grep -E '(^|[^0-9])\(?[2-9][0-9]{2}\)?[-. ][0-9]{3}[-. ][0-9]{4}([^0-9]|$)' <<<"$body" | grep -vE '[-. ]555[-. ]01[0-9]{2}' | report "a US phone number")"$'\n'
if [[ $data -eq 1 ]]; then
  findings+="$(grep -E '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' <<<"$body" \
    | grep -viE '@([A-Za-z0-9.-]*\.)?(example\.(com|org|net)|test|invalid|localhost|example)([^A-Za-z0-9.-]|$)|noreply|no-reply' | report "an email address")"$'\n'
fi

findings="$(grep -v '^$' <<<"$findings")"
if [[ -n "$findings" ]]; then
  {
    echo "guard-phi: possible PHI/PII in a file you just wrote (values not shown):"
    sort -u <<<"$findings" | head -20
    echo "Replace with clearly synthetic data (e.g. 000-00-0000, 555-0100, user@example.com, 'Jane Test'). If a line is deliberately synthetic, append a 'phi-ok' comment explaining why. Do not paste real patient data anywhere."
  } >&2
  exit 2
fi
exit 0
