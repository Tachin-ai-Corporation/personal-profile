---
title: 'Foundation: optional controlled DateInput display text'
type: 'foundation'
created: '2026-10-19'
status: 'done'
context:
  - '{project-root}/components/ui/date-input.tsx'
  - '{project-root}/components/ui/date-input.test.tsx'
---

## Authorization and problem

The user approved “si ampliar el dateinput” on 2026-10-19 as a narrow Story 7.5 scope exception on this branch. The wire-only DateInput API cannot display externally restored partial/impossible dates, although Account drafts correctly retain their masked text. No integrator documentation, unrelated foundation code, Team A source, dependency, push, deployment or real-account write is authorized by this exception.

## Additive API

Add optional `textValue?: string` to DateInput. When supplied, it controls the displayed string verbatim, including empty, partial and impossible masked dates. Parent callers update it from the existing `onChange(wireValue, { text })`, and pass the corresponding `value = displayToWireDate(textValue) ?? ""` for wire/calendar selection. Caller-provided text also owns controlled resets. Omitted `textValue` preserves the existing internal text, wire synchronization and `resetKey` behavior. Existing masking, caret, paste, bounds, readOnly and calendar selection code remains in place.

## Isolated scope

- `components/ui/date-input.tsx`: additive prop, destructuring and display precedence only.
- `components/ui/date-input.test.tsx`: external partial/impossible/valid/empty transitions, no unsolicited change events, controlled typing/caret/paste/reset, legacy mode return, readOnly and calendar bounds/selection.
- `features/shell/__fixtures__/inputs-fixture.tsx`, `e2e/inputs.spec.ts`: controlled display-text integration, external restore buttons, existing control keyboard/calendar/axe coverage.
- `features/account/account-edit-fields.tsx`, Account unit/e2e tests: consume the new prop and prove exact invalid draft text survives reload/restore, still validates and sends no write.

## Evidence

- Initial focused shared DateInput + Account section run: 2 files / 58 tests passed, including all pre-existing DateInput tests.
- Final `corepack pnpm vitest run --coverage --maxWorkers=4`: 185 files / 4,677 tests passed; 100% statements/branches/functions/lines across enforced server/API/shared coverage (`/tmp/account-complete-coverage.log`).
- Production `corepack pnpm test:e2e e2e/account-settings-edit.spec.ts e2e/account-settings.spec.ts e2e/account-page.spec.ts e2e/shell.spec.ts e2e/inputs.spec.ts e2e/profile-personal.spec.ts --workers=4`: build passed, 300 browser cases passed / 4 existing conditional skips, both viewports (`/tmp/account-date-final-browser.log`).
- Typecheck, lint, forbidden/token and staged/unstaged whitespace checks passed. Full details are in Story 7.5 Verification.
- Reviewed with Story 7.5 through all three BMAD Build layers; all findings resolved, no known remaining defect. Integrator-owned `docs/FOUNDATION.md`, `CLAUDE.md` and `AGENTS.md` remain unchanged.

- Final parent verification after review corrections: 185 files / 4,688 unit tests, 100% enforced coverage (`/tmp/pp-7-5-final-coverage.log`); production build plus 300 browser passes / 4 expected skips (`/tmp/pp-7-5-final-browser-stable.log`). Final typecheck, lint, forbidden/token and whitespace gates passed. BMAD's terminal local-commit step isolates this change from the Account feature; no remote publication occurred.
