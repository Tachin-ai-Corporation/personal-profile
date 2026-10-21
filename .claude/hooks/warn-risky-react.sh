#!/usr/bin/env bash
#
# Claude Code PostToolUse hook (matcher: Write|Edit|MultiEdit) — flags TypeScript/React anti-patterns the
# standard forbids (CLAUDE.md § TypeScript & JavaScript core rules, § React rules, § Security) in the file
# just edited, with line numbers. Exit 2 feeds them back to Claude. Complements ESLint for projects whose
# lint config is still weak. Suppress a justified line with `// risky-ok: <why>` (or the tool's own
# `eslint-disable-next-line <rule> -- <why>` form).
#
# Flags: console.log/debug/info (not in tests/stories/scripts), debugger, dangerouslySetInnerHTML, eval /
# new Function / string timers, innerHTML/outerHTML/document.write, `any`, `@ts-ignore`, blanket
# eslint-disable, token-ish values written to localStorage/sessionStorage, target="_blank" without rel,
# leftover `.only(`/`fdescribe`, forwardRef/defaultProps/PropTypes/ReactDOM.render in new code, array
# index used as key, non-null assertions chains, empty catch blocks, `as unknown as`.
# Requires: jq.
set -o pipefail

input="$(cat)"
f="$(jq -r '.tool_response.filePath // .tool_input.file_path // empty' <<<"$input" 2>/dev/null)"
case "$f" in *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.mts|*.cts) ;; *) exit 0 ;; esac
[[ -f "$f" ]] || exit 0
case "$f" in */node_modules/*|*/dist/*|*/coverage/*|*.d.ts|*.gen.ts|*/generated/*) exit 0 ;; esac

is_test=0; is_tool=0
case "$f" in *.test.*|*.spec.*|*/__tests__/*|*/test-utils/*|*/e2e/*|*/tests/*|*/setupTests.*|*/vitest.setup.*) is_test=1 ;; esac
case "$f" in *.stories.*|*/scripts/*|*.config.*|*/.storybook/*) is_tool=1 ;; esac

body="$(grep -nvE '(//|/\*|\{/\*)[[:space:]]*risky-ok|eslint-disable(-next-line|-line)?[[:space:]]+[@a-z/-]+[^-]*--[[:space:]]*[A-Za-z]' "$f")"
msgs=""
chk() {  # $1 = ERE, $2 = message (reports line numbers)
  local lns
  lns="$(grep -E "$1" <<<"$body" | cut -d: -f1 | head -8 | tr '\n' ',' | sed 's/,$//')"
  [[ -n "$lns" ]] && msgs="${msgs}  line ${lns}: $2"$'\n'
}

[[ $is_test -eq 0 && $is_tool -eq 0 ]] && chk '^[0-9]+:[[:space:]]*console\.(log|debug|info|trace)\(' "console.* — use the project's logger (lib/logger)"
chk '^[0-9]+:[[:space:]]*debugger[[:space:]]*;?[[:space:]]*$' "leftover debugger statement"
chk '^[0-9]+:.*dangerouslySetInnerHTML' "dangerouslySetInnerHTML — sanitize (DOMPurify) inside the one SafeHtml component"
chk '^[0-9]+:.*(^|[^A-Za-z_.$])eval\(|new[[:space:]]+Function\(|set(Timeout|Interval)\([[:space:]]*["'"'"'`]' "eval / new Function / string timer"
chk '^[0-9]+:.*\.(innerHTML|outerHTML)[[:space:]]*=[^=]|document\.write(ln)?\(' "raw HTML injection (innerHTML/outerHTML/document.write)"
[[ $is_test -eq 0 ]] && chk '^[0-9]+:.*(:[[:space:]]*any([^A-Za-z0-9_]|$)|[[:space:]]as[[:space:]]+any([^A-Za-z0-9_]|$)|<any>|Array<any>|Promise<any>)' "explicit any — use unknown + narrowing or a precise type"
chk '^[0-9]+:.*@ts-ignore' "@ts-ignore — use @ts-expect-error with a reason"
chk '^[0-9]+:.*(/\*|//)[[:space:]]*eslint-disable[[:space:]]*(\*/)?[[:space:]]*$' "blanket eslint-disable — name the rule and give a reason"
chk '^[0-9]+:.*(localStorage|sessionStorage)\.setItem\([^)]*([Tt]oken|[Jj]wt|[Ss]ecret|[Pp]assword|[Aa]uth|[Ss]ession)' "auth material in web storage — use httpOnly cookies set by the backend"
chk '^[0-9]+:.*target=["{'"'"']+_blank' "target=_blank (check it also has rel=\"noopener noreferrer\")"
[[ $is_test -eq 1 ]] && chk '^[0-9]+:.*((describe|it|test)\.only\(|fdescribe\(|fit\()' "focused test (.only) left in the suite"
chk '^[0-9]+:.*(forwardRef\(|\.defaultProps[[:space:]]*=|PropTypes\.|ReactDOM\.render\(|<[A-Za-z.]+\.Provider[[:space:]>])' "legacy React API (forwardRef/defaultProps/PropTypes/ReactDOM.render/Context.Provider) — use React 19 idioms"
chk '^[0-9]+:.*key=\{[[:space:]]*(i|idx|index)[[:space:]]*\}' "array index as key — use a stable id"
chk '^[0-9]+:.*as[[:space:]]+unknown[[:space:]]+as[[:space:]]' "double cast (as unknown as) — validate with a schema or fix the type"
chk '^[0-9]+:.*catch[[:space:]]*(\([^)]*\))?[[:space:]]*\{[[:space:]]*\}' "empty catch block — handle, report, or rethrow"
chk '^[0-9]+:.*\.catch\([[:space:]]*\(\)[[:space:]]*=>[[:space:]]*(\{[[:space:]]*\}|undefined|null)[[:space:]]*\)' "swallowed promise rejection"
chk '^[0-9]+:.*[]A-Za-z0-9_)]!(\.|\[|\))' "non-null assertion (!) — narrow instead, or explain the invariant"
chk '^[0-9]+:.*import\.meta\.env\.' "import.meta.env read outside lib/env.ts"

# the env rule only applies outside the one validated module
case "$f" in */lib/env.ts|*/env.ts|*vite*config*|*/vite-env.d.ts) msgs="$(grep -v 'import.meta.env read' <<<"$msgs")" ;; esac
[[ $is_test -eq 1 ]] && msgs="$(grep -v 'import.meta.env read' <<<"$msgs")"

# data-less lines left by filtering
msgs="$(grep -v '^$' <<<"$msgs")"
if [[ -n "$msgs" ]]; then
  { echo "warn-risky-react: $f contains patterns our standard forbids (fix, or justify with '// risky-ok: <why>'):"; printf '%s\n' "$msgs"; } >&2
  exit 2
fi
exit 0
