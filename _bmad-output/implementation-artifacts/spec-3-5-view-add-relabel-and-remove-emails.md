---
title: 'Story 3.5: View, add, relabel and remove emails'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ad45cefba320856e79fcf97320ee5a7f7fd61016'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Email Section is still the F6-1 placeholder. Users can't see their email addresses, add new ones, change labels or remove old ones (Story 3.5, FR20, NG-9024; acceptance source: `epics.md` "### Story 3.5: View, add, relabel and remove emails").

**Approach:** Fill `features/contacts/email-section.tsx` with the Phone Section's patterns (3.1–3.4): the read view, whole-table edit and save. It uses the same Contact Point engine (`contactPointsDiffToManageDTO`, `saveContactPoints(dto, "email")`), `contact-labels.ts` and the existing `POST v2/health/contact-point` proxy entry. The edit cells Phone and Email both need (help/error wiring, Label `Select`, "—" notifications, new-row keys) move into one module in `features/contacts`, and Phone imports them from there with no change in behaviour.

## Boundaries & Constraints

**Always:**
- **Read:** `useSWR(keys.contactPoints("Email"))`.
  - Rows without a value are dropped. Keys are unique (`id-<id>`, a repeated id gets `~n` and is locked). The `findPrimary` row goes first and is the only one shown as Primary.
  - `StateFrame` has `skeleton="table"`, `columns={SECTION_COLUMNS.email}`, `loadError {kind:"section", sectionId:"email"}` ("Couldn't load emails"), `level="section"`, `attempt` and `onReady`. Retry revalidates only the Email key, and a 403 shows `NoAccess`.
  - `SectionHeader count` and `useReportSectionCount("email", n)`.
- **Read columns:** Email address (`cell-strong`, wraps) · Label (chip; filled primary chip on the Primary) · Status ("Verified" / "Not verified" `StatusBadge`; empty on Home) · Notifications ("On"/"Off" on the Primary only, the "—" with "Not applicable" elsewhere) · actions.
  - Below 768 px, line 1 holds the email and status, line 2 the label and notifications.
- **Kebab:** `RowActions` named "More actions for {email}", with Edit (focuses that row's Label, or its locked address) and Remove (a row with an id: edit view with the row struck through, focus on Restore). There is no Verify or Make primary (Story 3.6).
- **Header and empty state:** an outline "Edit" (with no emails it opens a new row) and "Add email", both 44 px. Only "Add email" is aria-disabled at the limit. The empty row reads "No emails yet · Add email".
- **Registration:** `useSectionForm` with `id: "email"`, `SHELL_MESSAGES.sectionEmail`, `displayOrder: 3`, `onNoChanges: "close"`, `cancelFocus: "heading"`, `fieldOrder`, `errorFields`, `draftFields: ["rows"]`, `describeDraftDiff`, `dataStatus`, and `SectionContainer sectionId="email"`.
- **Saved row (edit):**
  - The address is `InputLocked`. Its help is "Locked. This is the address you sign in with." on the Primary row and "Saved addresses can't be changed. Remove it and add a new one." on every other row.
  - Label is a `Select` of `contactLabelsFrom(type-key names)` without Primary. The Primary row's label (and any Primary-labelled or id-less row's) shows as a locked chip.
  - Status and Notifications show as read.
- **New row:** an `Input type="email"` (`autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="none"`, named by the column header), a required Label `Select`, and "New · not saved". Notifications are off and the add `type` is `"Email"`.
- **Validation** (`features/contacts/email-schema.ts`, `emailSchema`; on blur and Save, nothing sent while an error remains, focus on the first invalid field):
  - the trimmed value fails `z.email()` or is over 254 characters (an empty value too) → "Enter a valid email address";
  - the trimmed value equals any other row's case-insensitively (saved, struck or new) → "This email is already on your profile";
  - an empty or unpickable Label → "Choose a label";
  - a new row past 20 (saved non-removed rows count first) → "You've reached the limit of 20 emails" at its address.
  - The value is sent trimmed.
- **Remove:**
  - On a saved row it strikes the row through ("Removed on save", Restore). On a new row it deletes the row.
  - It is aria-disabled with "You need at least one email" when exactly one sendable email would remain and the person had saved emails, and with "Make another email primary first" on a Primary-labelled saved row.
- **Limit:** 20 emails (saved non-removed + new). At 20, "Add email" and "Add row" are aria-disabled with "You've reached the limit of 20 emails".
- **Save:**
  - One POST via `contactPointsDiffToManageDTO(saved, edited)` + `saveContactPoints(dto, "email")`. A saved email the form doesn't hold is kept.
  - **Success:** the Email key's `mutate()` + `mutateMyself()` (the header and `/account` follow). A failed refetch still counts as saved. Then read view, "Email saved.", the `h2`, and the draft cleared.
  - **Failure:** `{ok:false}` with `mapApiError("email")`. Unknown → "Couldn't save email." + Retry; network → "Couldn't save email. Check your connection." + Retry. Never throws.
- **Errors** (`lib/api/errors/contacts.ts`, `email` scope, anchored backend texts):
  - `INSTANT_TEST_INVALID_EMAIL` "`%s is not a valid email.`" → field `value`, "Enter a valid email address";
  - the limit text → field `type`, "You've reached the limit of 20 emails" (Section level: Email maps only `value`/`label`);
  - `Invalid 'Label' specified…` → field `label`, "Choose a label from the list".
  - The duplicate rules already exist. `errorFields` maps `value`/`label` to the single new row when exactly one exists.
- **Copy:** new `CONTACT_MESSAGES` keys. Grep the catalog first. Verbatim (V&T): "Enter a valid email address", "You need at least one email", "Make another email primary first", "You've reached the limit of 20 emails", both locked helps. DRAFT: "No emails yet", "Add email". Reuse `chooseLabel`, `addRow`, `labelNotOffered`, `duplicateEmail` and the notifications keys.
- Enter never submits, and Escape never cancels. 44 px targets, axe light and dark, no horizontal scroll at 360 px.

**Decisions (agent, 2026-10-19; no human input needed):**
- **Shared edit kit:** `CellField`, `ChoiceCell`, `NotApplicable`, `nextNewKey` and the unique-key helper move to `features/contacts/contact-edit-kit.tsx`. Phone imports them, and its tests stay unchanged and green. This is Team A code, not foundation.
- **No auto-verify, Primary rules or notifications switch for Email:** Story 3.6 owns them. The Primary chip is locked, and its Remove is disabled with a reason, so 3.5 never sends a Primary change.
- **`e2e/shell.spec.ts`:** its mobile branch asserts that "no Section reads Email until Story 3.5". That line is removed, along with its comment, and the header-scoped assert that the header shows no email below 768 px stays. This is the only foundation-file edit. The user allowed it "only if needed", and this one is needed.
- **Local-view worktree:** after the commits, `personal-profile-local-view` is moved to the new HEAD with its uncommitted dev-mock patch. The manage POST mock already exists. It gains the backend's email checks (invalid format, duplicate, 20 per type) so the new error paths can be tried there.

**Never:**
- Don't edit `features/shell/**`, `features/header/**`, `components/ui/*` (existing ones), `lib/api/{index,contact-points,keys,type-keys}.ts`, `allowlist/**`, the foundation message files, `test/**` or `e2e/fixtures/{core,index}.ts`. `e2e/shell.spec.ts` gets only the change above.
- Don't change the Phone behaviour or the engine.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Read | Email [Work 41 unverified, Primary 42 notif on, Home 43] | rows 42, 41, 43; Status Verified / Not verified / empty; Notifications On / — / —; count 3 | N/A |
| Add | new ` Ann@Work.example `, Personal; Save | POST `{contactPointsToAdd:[{value:"Ann@Work.example",type:"Email",label:"Personal",isNotificationEnabled:false}],contactPointsToUpdate:[],contactPointsToRemove:[]}`; read view; "Email saved."; `h2` | N/A |
| Relabel / Remove | saved Work → Main; remove 43 | one POST with update `{id:41,type:"Email",label:"Main",isNotificationEnabled:false}` and remove `[43]` | N/A |
| Invalid | `ann@`; `ANN@x.com` vs saved `ann@x.com` (struck); empty label | the three messages at their fields; nothing sent; focus first invalid | N/A |
| Last / Primary | one email; Remove on Primary | aria-disabled "You need at least one email" / "Make another email primary first" | N/A |
| Limit | 20 saved | Add email and Add row aria-disabled with the limit reason; Edit still works | N/A |
| 400 invalid | `x is not a valid email.`, one new row | "Enter a valid email address" at that row | stays in edit |
| Unknown / network | 400 other / network | "Couldn't save email." / "… Check your connection." + Retry | stays in edit |
| Empty / error | `[]` / 500 | "No emails yet · Add email" / "Couldn't load emails" + Retry (Email key only) | Phone unaffected |

</frozen-after-approval>

## Code Map

- `features/contacts/phone-section.tsx` -- the template. Lines 87–118 (rows, unique keys, Primary hoist), 301–318 (`NotApplicable`, `notificationsOf`), 343–347 (load error), 349–450 (paths, shape, field order, error fields, `nextNewKey`, `removeReason`, `CellField`), 497–537 (`ChoiceCell`), 541–544 (`LockedCell`), 644–677 (`editedContactPoints`), 738–1177 (the Section: attempt counter, baseline/savedPoints, `save`, `useSectionForm`, rebase on leaving edit, add/remove/edit/kebab, header actions, `StateFrame`).
- `features/contacts/phone-schema.ts` -- the template for `email-schema.ts` (row schema, `superRefine`, `*EditRowOf`, `new*EditRow`, draft rows / `describeRow` / `*DraftDiff`).
- `lib/api/contacts.ts` -- `contactPointsDiffToManageDTO`, `saveContactPoints(dto, scope)` (already takes the scope), `ContactPointEditRow`. No change.
- `lib/api/errors/contacts.ts` -- add the `email` rules next to `phoneRules`. Backend: `ContactPointServiceImpl.java:202` (`INSTANT_TEST_INVALID_EMAIL`, `Messages.java:858` "%s is not a valid email.").
- `lib/shared/messages/contacts.ts` -- the new keys. `STATE_MESSAGES.loadNounEmail`, `SHELL_MESSAGES.sectionEmail` and `columnEmailAddress` already exist.
- `components/ui/{input,input-locked,select,status-badge,chip,disabled-action}.tsx`; `features/shell` (`SectionTable` wraps cells already, `RowActions`, `RowRemoval`, `RowEditStatus`, `SectionFooter addRow`).
- Tests to copy: `features/contacts/phone-section.test.tsx` (read), `phone-section.edit.test.tsx` (edit/save/errors/drafts, 20 s timeout), `phone-schema.test.ts`; e2e `e2e/profile-phone.spec.ts` (`openWith`, `mockContacts`, `mockContactManage`, axe, 360 px).
- `e2e/shell.spec.ts:165-168` -- the mobile Email-not-fetched assert to drop.
- `../personal-profile-local-view/lib/server/dev-mock.ts` -- `manageContactPoints`, `primaryRuleError`, the POST handler (~l.294). Add the email checks there (uncommitted local patch, never committed to the feature branch).

## Tasks & Acceptance

**Execution:**
- [x] `features/contacts/contact-edit-kit.tsx` -- move the shared cells and helpers. `phone-section.tsx` imports them (no behaviour change).
- [x] `lib/shared/messages/contacts.ts` -- the new keys.
- [x] `lib/api/errors/contacts.ts` (+ `lib/api/errors/contacts.test.ts` or the existing errors table test) -- the three email rules.
- [x] `features/contacts/email-schema.ts` (+ test) -- every rule, including struck duplicates, trim, 254 and the limit; plus draft diff.
- [x] `features/contacts/email-section.tsx` (+ `email-section.test.tsx`, `email-section.edit.test.tsx`) -- the read view, the edit view, entry points, Remove/Restore, disabled reasons, save, errors, Cancel, drafts, Enter/Escape, axe light/dark.
- [x] `e2e/profile-email.spec.ts` -- read; add → save → read with the POST body and the refetch; relabel/remove; last-email disabled; invalid; duplicate 400; limit; 360 px read and edit; axe.
- [x] `e2e/shell.spec.ts` -- the one-line removal above.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- the `3-5` line (status and note only).

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100% coverage on `lib/server`, `lib/api` and `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed, plus the one `e2e/shell.spec.ts` line.

## Implementation Notes

- **Kit:** `contact-edit-kit.tsx` exports `CellField`, `ChoiceCell` (generic over the form values; the unused `item` prop is gone), `NotApplicable`, `nextNewKey`, `uniqueRowKeys` and `isRepeatKey`. Phone's tests are unchanged and green.
- **Copy markers:** `messages.test.ts` matches only whole quoted Voice and Tone strings. The table writes the email forms of "You need at least one …", "Make another … primary first" and the limit only as "…email…" variants (or not at all), so those three keys carry `// DRAFT COPY` with their V&T source in the comment. "Enter a valid email address" and both locked helps are literal and unmarked.
- **Limit error position:** the schema's limit is checked after the format and duplicate rules on the same `value` field, so an invalid address shows only its format error.
- **Stale drafts can't switch the Primary:** `editedContactPoints` takes a draft's label only when it isn't Primary and the saved row isn't Primary-labelled. A draft that strikes a row made Primary meanwhile makes the engine refuse the body. `save()` catches that and answers `{ code: "UNEXPECTED", mapped: generic }` ("Couldn't save email."). Nothing is sent.
- **Kebab:** read-view `RowActions` holds only Edit and Remove (no inline actions), on every row with an id.
- **Local-view worktree:** `../personal-profile-local-view/lib/server/dev-mock.ts` gained `valueRuleError`, uncommitted: invalid Email format, a duplicate value unless removed in the same request, and 20 per type. The POST handler checks it before the Primary rules. The worktree is still at `ad45cef`. Move it to the new HEAD once the 3.5 commits exist.

- **Review pass 1 patches:** rows 1, 3, 4, 12 and 22–24 of the triage log; Phone's identical repeated-id gap went to `deferred-work.md` (row 25).
- **E2E tooltip flake:** "the last email and the Primary can't be removed" flaked once on desktop in the full run. `focus()` scrolled the lower Email row into view, and Radix closes a tooltip when its trigger's scroller scrolls. Each Remove is now scrolled into view before focus, the pattern `e2e/primitives.spec.ts` uses. The test then passed 30/30 (`--repeat-each=15`, both projects, no retries).
- **Final verification (Node 24.22, after the review patches):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 5139/5139 passed (193 files), coverage thresholds met.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 763 passed, 10 skipped (by design), 1 flaky (the test above). After the fix, the Email, Phone and shell specs gave 159 passed and 1 skipped, none flaky.

## Spec Change Log

- **2026-10-22, QA bug fix (Daniel, branch `bugfix/NG-9024-NG-9025-contacts-email-and-social-validation`):** new rule for a new address. When its domain is a likely typo of a well-known provider (`suggestEmailCorrection` in `lib/shared/email-typo.ts`: `test@gmail.cnn`, `test@gmail.cdm`, `test@gmial.com`), it reads "Did you mean test@gmail.com?" (DRAFT COPY) at the address and nothing is sent. Unknown domains (`name@mycompany.health`) are never flagged. The check runs after the format check and before the duplicate check.

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | B, E | The read-view kebab offers Remove on a repeated-id row; edit view then shows it struck with no Restore, and Save sends nothing yet toasts | medium | Real: `EmailReadActions` checks only `point.id`, while `baseline` nulls the repeat's id and the edit actions return `null` → **patch**: no Remove on `isRepeat(row)`, plus a test. |
| 2 | B, E | `z.email()` differs from the backend `BoUtil` regex (curly apostrophes, `_ann@`) | low | Real, but the AC requires a zod email, and the backend 400 is mapped to the field → rejected. |
| 3 | B | The 254-character comment claims a backend limit that doesn't exist | low | Real: there is no length check in `ContactPointServiceImpl` → **patch**: reword it as the RFC 5321 client rule. |
| 4 | B | The "sent trimmed" tests can't fail (`type="email"` sanitizes whitespace) | low | Real: jsdom `sanitizeValueByType` strips it → **patch**: a test with an untrimmed value from a restored draft. |
| 5 | B | The locked help says "Remove it" on rows that have no Remove (id-less, repeat, legacy Primary) | low | Verbatim AC/V&T copy on rare legacy rows → rejected. |
| 6 | B | Server errors with two or more new rows show at Section level without naming the row | low | Spec'd design, the same as Phone → rejected. |
| 7 | B, E | Retry on deterministic failures (the limit, the stale-draft refusal); the bare `catch` has no log | low | Shared `useSectionForm` behaviour, the same as Phone; the refusal needs a stale draft plus a Primary switch elsewhere → rejected. |
| 8 | B | A stale draft skips the duplicate and limit checks against saved rows the form doesn't hold | low | Rare, and the backend rejects it with a mapped error → rejected. |
| 9 | B | A draft conflict row for an empty new row has an empty name | low | Rare; Phone has the same pattern; a fix needs new copy → rejected. |
| 10 | B | The `e2e/shell.spec.ts` change leaves "the header fetches nothing below 768 px" unchecked | false | `features/header/profile-header.test.tsx:239-247` asserts that the header fetches nothing at 360 px (VG confirmed). |
| 11 | B | A legacy second Primary-labelled row reads "Make another email primary first" | low | Rare legacy data; matches Phone → rejected. |
| 12 | B, E | The duplicate-400 e2e asserts only the first recorder, so the second Save's POST is unchecked | low | Real: the newer route wins, so `posts()` stays 1 regardless → **patch**: assert the second recorder. |
| 13 | B | The spec's "would remain" wording differs from the code | — | The fix edits this build's spec → rejected. |
| 14 | B | The spec holds a local scratchpad path and line ranges that are now stale | — | The fix edits this build's spec → rejected. |
| 15 | B | The generic `ChoiceCell` casts `onChange`'s value | low | Developer-only, no named failure → rejected. |
| 16 | E | A restored draft that predates a Primary switch shows that row's Label as editable | low | Needs a Primary switch elsewhere during the draft; the save guard sends no change → rejected. |
| 17 | E | Such a relabel is dropped silently and "Email saved." shows | low | Same scenario as row 16 → rejected. |
| 18 | E | A draft row deleted elsewhere still counts as remaining, which can bypass the last-email guard | low | The only real email is the Primary, whose Remove is disabled, and the backend refuses a Primary delete → rejected. |
| 19 | E | The schema has no minimum-one rule | low | Same as row 18 → rejected. |
| 20 | E | Id-less and repeat rows count toward the limit of 20 | low | Rare legacy data; matches Phone → rejected. |
| 21 | E | A whitespace-only value shows as a row | low | Needs malformed platform data → rejected. |
| 22 | VG | A saved email with no label is never saved in a test | low | The gap is real; the code keeps `point.label` → **patch**: a test. |
| 23 | VG | With no saved emails, nothing tests that the only new row's Remove stays enabled | low | Gap → **patch**: a test. |
| 24 | VG | The kebab's last-email rule ignoring id-less rows is untested | low | Gap → **patch**: a test. |
| 25 | B | Phone's `PhoneReadActions` has the same repeated-id Remove gap | medium | Pre-existing (3.2), and the spec forbids changing Phone → **defer**. |

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; `corepack pnpm` if `pnpm` isn't on `PATH`. No git commits and no push. Never run `CI=1` e2e without a fresh build. Never run `pnpm dev` in this checkout. If `app/test-fixtures.test.ts` fails on the glob, delete `node_modules/.vitest-cache`):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
