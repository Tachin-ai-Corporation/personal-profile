---
title: 'Story 3.7: Manage social media links'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
baseline_commit: 'eafab8cd5088490c6bb9be5a0ff01e96899f2e4d'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Social media Section is still the F6-1 placeholder. Users can't see, add, change or remove links to their social profiles, or open them from their profile (Story 3.7, FR24, NG-9025; acceptance source: `epics.md` "### Story 3.7: Manage social media links").

**Approach:** Fill `features/contacts/social-section.tsx` with the Email Section's patterns, without labels, status, Primary, notifications or verify. It reuses:
- `contact-edit-kit.tsx`: `CellField`, `nextNewKey`, `uniqueRowKeys`, `isRepeatKey`;
- the shell row kit: `RowActions` with Edit and Remove, `RowRemoval`, `RowEditStatus`, `SectionTable`;
- the Contact Point engine with a new opt-in replace mode, so an edited saved link is sent as a remove plus an add in one request;
- the existing `POST v2/health/contact-point` proxy entry.

## Boundaries & Constraints

**Always:**
- **Read:** `useSWR(keys.contactPoints("Social Media"))`. Rows without a value are dropped. Keys are unique (`id-<id>`); a repeated id gets `~n` and is locked.
  - `StateFrame` has `skeleton="table"`, `columns={SECTION_COLUMNS.social}`, `loadError {kind:"section", sectionId:"social"}` ("Couldn't load social links"), `level="section"`, `attempt` and `onReady`.
  - Retry revalidates only the Social key, and a 403 shows `NoAccess`.
  - `SectionHeader count` and `useReportSectionCount("social", n)`.
- **Read columns:** Link (wraps) · actions. A value that passes `safeHref(value, ["https:"])` renders as an `<a>` with `link-text`, `target="_blank"` and `rel="noopener noreferrer"`, never through `navigate()` (AD-5 exception). Any other value renders as plain text. No `dangerouslySetInnerHTML`.
- **Kebab:** `RowActions` named "More actions for {link}", holding only Edit (focuses that row's input) and Remove (edit view with the row struck through, focus on Restore). A row without an id or a repeat offers no Remove, and its input is locked.
- **Header and empty state:** outline "Edit" (it opens a new row when there are no links) and "Add link", both 44 px. The empty row reads "No social links yet · Add link".
- **Registration:** `useSectionForm` with:
  - `id: "social"`, `SHELL_MESSAGES.sectionSocial`, `displayOrder: 4`;
  - `onNoChanges: "close"`, `cancelFocus: "heading"`;
  - `fieldOrder`, `errorFields` (`value` → the single changed or new row);
  - `draftFields: ["rows"]`, `describeDraftDiff`, `dataStatus`;
  - `SectionContainer sectionId="social"`.
- **Edit:** every row with an id that isn't labelled Primary is an editable `Input type="url"` (named by the column header, `autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="none"`). New rows show "New · not saved".
- **Validation** (`features/contacts/social-schema.ts`, `socialSchema`; on blur and Save; focus on the first invalid field; nothing is sent while an error remains), on the trimmed value of every row that isn't struck through:
  - empty → "Enter a link";
  - not an https link (the client URL rule below; a handle like `@name`, `http:` and `javascript:` included) → "Enter a link that starts with https://" (DRAFT);
  - equal case-insensitively to any other row (saved, struck or new) → "This link is already on your profile";
  - a new row past 20 (saved rows that aren't struck through count first) → "You've reached the limit of 20 links".
  - Values are sent trimmed.
- **Remove:** strikes a saved row through ("Removed on save", Restore) and deletes a new row. It is never disabled for being the last link; zero links is allowed.
- **Legacy Primary link** (a saved Social Media row labelled Primary): its value is `InputLocked`, and its Remove (in edit view and in the kebab) is aria-disabled with "This link can't be removed or changed here." (DRAFT). Nothing is ever sent for it, because the backend refuses to remove or replace a Primary without a replacement.
- **Limit:** 20 links. At 20, "Add link" and "Add row" are aria-disabled with "You've reached the limit of 20 links".
- **Engine replace mode** (`lib/api/contacts.ts`): `contactPointsDiffToManageDTO(before, after, { valueChange: "replace" })`. A saved row whose `value` changed (same type) puts its id in `contactPointsToRemove` and an add of the new value in `contactPointsToAdd`, in the same body. Without the option the immutable guard still throws, and a type change always throws. Unit-tested for both, with Phone and Email untouched.
- **Save:** one POST via `saveContactPoints(dto, "social")`. Every added link (new or replacement) is sent with `type: "Social Media"`, `label: "Personal"` and `isNotificationEnabled: false`. A saved link the form doesn't hold is kept.
  - Success: `social.mutate()` + `mutateMyself()`, read view, "Social media saved.", the `h2`, the draft cleared. There is no verify call.
  - Failure: `{ok:false}` with `mapApiError("social")`. Unknown → "Couldn't save social media." + Retry; network → "Couldn't save social media. Check your connection." + Retry. It never throws.
- **Errors** (`lib/api/errors/contacts.ts`, `social` scope, anchored):
  - "Invalid URL provided '…'." → field `value`, "Enter a link that starts with https://";
  - the 20-per-type limit → field `type` (Section level), "You've reached the limit of 20 links";
  - the duplicate rules (already built).
- **Below 768 px:** each link is a stacked card (link, kebab right). Long URLs wrap with no horizontal scroll at 360 px, and the inputs stack full width.
- **Copy:** new `CONTACT_MESSAGES` keys. Grep the catalog first. "No social links yet", "Add link", "Enter a link", the limit and the invalid-link text are DRAFT.
- Enter never submits, and Escape never cancels. 44 px targets, axe in light and dark.

**Decisions (agent, 2026-10-19):**
- **Replace sends remove + add, as the AC asks.** The backend could also take a changed `value` in `contactPointsToUpdate`, but the strict proxy schema refuses `value` on update. Remove + add needs no proxy change, and the backend deletes before it creates, so the same address can be re-added in one request.
- **Client URL rule:** the trimmed value starts with lowercase `https://`, parses with `new URL`, has a hostname with a dot whose last label is 2 or more letters, and holds no whitespace. This follows the backend's case-sensitive `Helper.validateURL`, restricted to https (AC).
- **No labels in the UI.** Saved links keep their label on the wire, but a replacement or new link is always "Personal".
- **Local-view worktree, after the commits:** move it to the new HEAD and keep its uncommitted dev mock. The mock gains Social Media rows (an https link, a long URL, a legacy non-https value) and the backend's `Invalid URL provided` check. The manage endpoint already exists there.

**Decisions (human, 2026-10-19):**
- **https links only:** handles are not accepted (the backend's `Helper.validateURL` refuses them). A legacy handle already saved shows as plain text.
- **Legacy Primary links are locked,** as above, so no request fails.
- **`e2e/shell.spec.ts` (approved after implementation):** the header test's expected set of contact reads gains "Social Media" (the Section's own read). This one-line foundation-file change ships in the feat commit, as Story 3.5's did.
- **Spec size:** over 1,600 tokens, kept whole because it is one goal (self-approved per the user's instruction).

**Never:** edit `features/shell/**`, `components/ui/*` (existing), `lib/api/{index,contact-points,keys}.ts`, `allowlist/**` (no proxy change), the foundation message files, `test/**` or `e2e/fixtures/{core,index}.ts`. Never use `target="_blank"` anywhere but a social link. Never change Phone or Email behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Read | `[{id:51,"https://x.com/ann"},{id:52,"@ann"}]` | 51 is an anchor (`_blank`, `noopener noreferrer`); 52 is plain text; count 2 | N/A |
| Add | new ` https://linkedin.com/in/ann `; Save | POST add `[{value:"https://linkedin.com/in/ann",type:"Social Media",label:"Personal",isNotificationEnabled:false}]`, update `[]`, remove `[]`; "Social media saved."; `h2`; no verify | N/A |
| Replace | 51 → `https://x.com/ann2` | one POST: remove `[51]`, add `[{value:"https://x.com/ann2",…"Personal"}]` | N/A |
| Remove all | strike 51 and 52; Save | remove `[51,52]`; empty state | N/A |
| Invalid | `http://x.com`, `javascript:alert(1)`, `@ann`, empty, a duplicate of a struck value | "Enter a link that starts with https://" / "Enter a link" / "This link is already on your profile"; nothing sent | N/A |
| Legacy Primary | saved 53 labelled Primary | its input locked; Remove (edit and kebab) aria-disabled with "This link can't be removed or changed here." | N/A |
| Limit | 20 saved | Add link / Add row aria-disabled with the limit | N/A |
| 400 URL | "Invalid URL provided 'https://x'." with one changed row | the invalid-link message at that row | stays in edit |
| Unknown / network | 400 other / network | "Couldn't save social media." / "… Check your connection." + Retry | stays in edit |

</frozen-after-approval>

## Code Map

- `features/contacts/email-section.tsx` -- the template: rows and unique keys (`emailRowsOf`), the attempt counter, `baseline`/`savedPoints`, `save()`, `useSectionForm`, the rebase on leaving edit, add/remove/edit/kebab, header actions, `StateFrame`, `editedContactPoints`. Drop the Label, Status, Notifications, verify and Make primary parts.
- `features/contacts/email-schema.ts` -- the template for `social-schema.ts` (row schema, `superRefine`, limit, `*EditRowOf`, `new*EditRow`, draft rows, `*DraftDiff`).
- `features/contacts/contact-edit-kit.tsx` -- `CellField`, `nextNewKey`, `uniqueRowKeys`, `isRepeatKey`.
- `lib/api/contacts.ts` -- `contactPointsDiffToManageDTO`: the guard is at l.157 (`row.value !== was.value || row.type !== was.type`); add the options parameter there. `saveContactPoints(dto, "social")`.
- `lib/api/errors/contacts.ts` -- add `socialRules` next to `emailRules`. Backend: `Messages.java:745` "Invalid URL provided '%s'.", `Helper.java:81` `VALID_URL`.
- `lib/shared/safe-href.ts` -- `safeHref(value, ["https:"])` returns the trimmed href or `undefined`.
- `lib/shared/messages/contacts.ts` -- new keys. These already exist: `STATE_MESSAGES.loadNounSocial`, `SHELL_MESSAGES.sectionSocial`, `columnLink` and `CONTACT_MESSAGES.duplicateSocial`.
- `lib/server/proxy/allowlist/contacts.ts` -- read only. The manage body allows `Social Media` adds (value ≤ 2048) and removes, and update rows have no `value`.
- Tests to copy: `email-section.test.tsx`, `email-section.edit.test.tsx` (20 s timeout), `email-schema.test.ts`, `lib/api/contacts.test.ts` (the `update` describe, l.97), `lib/api/errors/contacts.test.ts`; e2e `e2e/profile-email.spec.ts` (`mockContacts`, `mockContactManage`).
- `../personal-profile-local-view/lib/server/dev-mock.ts` -- the contact rows (l.70) and `valueRuleError`.

## Tasks & Acceptance

**Execution:**
- [x] `lib/api/contacts.ts` (+ `contacts.test.ts`) -- the replace option.
- [x] `lib/shared/messages/contacts.ts`, `lib/api/errors/contacts.ts` (+ test) -- the social keys and rules.
- [x] `features/contacts/social-schema.ts` (+ test) -- every rule, the draft diff.
- [x] `features/contacts/social-section.tsx` (+ `social-section.test.tsx`, `social-section.edit.test.tsx`) -- every I/O row; anchor attributes on every rendered link; axe light and dark.
- [x] `e2e/profile-social.spec.ts` -- read (anchor vs text), add, replace, remove all, invalid, limit, 400, 360 px read and edit with a long URL, axe.
- [x] `sprint-status.yaml` -- the `3-7` line only.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100% coverage on `lib/server`, `lib/api` and `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed.
- Given the whole app, when searched, then `target="_blank"` appears only on the social link anchor.

## Implementation Notes

- **Validation scope:** the rules run on new rows and on saved rows whose trimmed link differs from the saved one (the epics AC's "a new or edited link field"), never on an unchanged saved row. Otherwise a legacy handle (matrix row 52) or a legacy duplicate the user never touched would block every save, and an unchanged link is never sent. The edit row carries `savedValue` for this.
- **Locked rows:** a legacy Primary, a row without an id and a repeated id are `InputLocked` with "This link can't be removed or changed here."; only the legacy Primary has a Remove (aria-disabled with that reason); the other two offer no Remove (as in Email). `editedContactPoints` never sends anything for a Primary-labelled row, so a stale draft striking a link that became Primary sends nothing.
- **Struck rows:** the input of a struck-through saved row is read-only until Restore. The draft compare names a row by its saved link (a new row by its link).
- **Input:** `type="url"`, `inputMode="url"`, `maxLength` 2048 (the proxy's value cap) instead of a length rule.
- **Read view:** no inline actions (the kebab holds Edit and Remove), so the actions column is `w-20`. The anchor is `inline-flex min-h-11` (44 px target) with the text wrapping anywhere.
- **Outside Team A paths:** `e2e/shell.spec.ts` (foundation) asserted the header's set of Contact Point reads as `Email, Landline, Mobile`; the Social Section now reads `Social Media` too, so the expected set gains it (same precedent as Story 3.5's edit of that spec). `lib/shared/profile-constants.ts` keeps a comment naming `target="_blank"` for Story 10.1's checkout link; it isn't rendered code.
- **e2e axe:** the spec's `axe` helper waits two more frames and the running animations after `setTheme`, since a struck row's read-only input inherits the muted color through the Input's `color` transition (one flaky dark-mode contrast hit otherwise).
- **Local-view worktree:** `../personal-profile-local-view/lib/server/dev-mock.ts` gained the three Social Media rows (ids 321–323) and the backend's `Helper.VALID_URL` check (`Invalid URL provided '…'.`). Moving the worktree to the new HEAD is left for after the commit.
- **Review pass 1 patches:** triage rows 1–4.
  - Links with a username or password are refused (`isSocialLink`), and a saved one shows as plain text (`socialHref`).
  - The engine's replace mode throws for Mobile, Landline and Email.
  - A struck saved link is compared by its saved value.
  - Row 14 (a `target="_blank"` gate) is in `deferred-work.md` (Foundation).
- **Final verification (Node 24.22, after the review patches):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 5377/5377 passed (199 files), coverage thresholds met.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 810 passed, 10 skipped (by design), none flaky.

## Spec Change Log

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | B | `isSocialLink` accepts credentials: `https://x.com@evil.example` reads like x.com but opens evil.example | medium | Real: `new URL(...).hostname` is `evil.example`, and the schema test accepts `https://user@x.com/a` → **patch**: reject a URL with a username or password, and render such a saved value as plain text. |
| 2 | B | Replace mode isn't limited to Social: any caller could replace a Mobile or Email value | low | Real: the engine never checks the type, and the AC requires Phone and Email to keep the immutable guard → **patch**: replace throws for Mobile, Landline and Email, with a test. |
| 3 | E | A saved link edited and then struck is compared by its edited text in the duplicate check | low | Real: `comparable` reads `value`, so its saved link is missed and the edited text is wrongly blocked → **patch**: a struck saved row compares by `savedValue`, with a test. |
| 4 | B | `editRow`'s doc comment says "by its link's current value" but it takes an index | low | Real → **patch**. |
| 5 | B, E, VG | A stale draft over a link made Primary since: it shows as editable, its change is dropped, and "Social media saved." shows | low | Nothing in the app makes a Social link Primary (legacy data only), so this is unlikely → rejected. |
| 6 | VG | A "Keep mine" draft over a link changed on the server sends the draft's old value without client validation | low | Needs a concurrent edit in another tab; the backend still validates (mapped error) → rejected. |
| 7 | E | A whitespace-only edit is dirty but sends nothing, and still toasts "saved" | low | Harmless: nothing needed sending; the shared `useSectionForm` behaviour → rejected. |
| 8 | B | A replaced link gets a new id, moves to the end and becomes "Personal" | low | The AC specifies remove plus add with label Personal → rejected. |
| 9 | B | No "(opens in a new tab)" warning on the link | low | A WCAG advisory technique (G201), not an AA criterion; the AC asks for none → rejected. |
| 10 | B | The invalid-URL 400 could name its row from the quoted value | low | An enhancement; the Section-level fallback is the spec'd design → rejected. |
| 11 | B | The client count of 20 can disagree with the backend's (value-less rows, repeated ids) | low | Needs malformed legacy data → rejected. |
| 12 | B | The kebab's Edit on a locked row leads only to a locked input | low | Same as Email (3.5); the locked help explains it → rejected. |
| 13 | B | `socialPrimaryLocked` is also the help on id-less and repeated rows | low | The text fits those rows too; renaming the key changes no behaviour → rejected. |
| 14 | B | Nothing automates "`target=\"_blank\"` only on the social link" | low | A real gate gap, but the fix is in `scripts/check-forbidden.sh` (foundation) → **defer** (Foundation). |
| 15 | B | The spec names a session Node path | — | The fix edits this build's spec → rejected. |
| 16 | B, E | The punycode top-level domain `xn--p1ai` is rejected | false | The backend's `VALID_URL` also requires a letters-only top-level domain of 2+ characters, so the client matches it. |
| 17 | B | The duplicate check doesn't normalize URLs (path case, trailing slash) | low | Design choice; the AC says a case-insensitive compare → rejected. |
| 18 | B | Missing tests: a changed-then-struck link (only removed), the 2048 `maxLength`, an e2e of the legacy Primary lock | low | The engine test covers "a struck changed row is only removed" (VG), and the unit tests cover the lock; row 3's patch adds the Section case → rejected. |
| 19 | E | A whitespace-only value from the API shows as a blank row | low | Needs malformed platform data → rejected. |
| 20 | E | A legacy value over 2048 characters passes the client and fails at the proxy | low | Needs a legacy value over 2048 characters → rejected. |
| 21 | E | The AC "only Team A paths changed" is contradicted by `e2e/shell.spec.ts` | low | Human-approved and recorded in Decisions; the fix edits the spec → rejected. |

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin` (the default `node` is 26); no git commits, no push; `corepack pnpm` if `pnpm` isn't on `PATH`; never `pnpm dev` here; never `CI=1` e2e without a fresh build; if `app/test-fixtures.test.ts` fails on the glob, delete `node_modules/.vitest-cache`):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
