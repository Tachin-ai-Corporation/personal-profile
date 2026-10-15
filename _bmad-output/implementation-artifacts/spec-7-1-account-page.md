---
title: 'Story 7.1 Account page — route, tabs, deep links and states'
type: 'feature'
created: '2026-10-15'
status: 'done'
route: 'oneshot'
baseline_commit: '48c96426379a5f72404a274949f1b3cd80c1f854'
story_key: '7-1-account-page-route-tabs-deep-links-and-states'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app bar's "Account" item points to `/account`, which does not exist (404), so Story 7.1 (`epics.md`, NG-9030) is unmet even though the shared foundation (F1–F7) already provides the tabs, anchors, state frames, 403 scopes, leave guard, feature stubs and session guard it needs.

**Approach:** Add the server route `app/account/page.tsx` that composes the existing foundation exactly as `app/account.test.tsx` already does (`requirePageSession()` → `PortalUrlProvider` → `PageFrame page="account"` with `ProfileHeader` → `AccountTabs` with `AccountPersonalPanel` (`AccountSettingsSection`, `AuthenticatorSection`), `ProviderTab`, `OrganizationsTab`; `dynamic = "force-dynamic"`; no Save-all slot), and prove the Story 7.1 acceptance criteria that are still Team B's with unit and Playwright tests. Team ownership (FOUNDATION §1): touch only `app/account/**`, `app/account.test.tsx`, `test/page-handlers/account.ts`, `e2e/account-*.spec.ts`, Team B area files and planning; no shell, `components/ui`, `index.ts`, foundation copy or `e2e/fixtures/{core,index}.ts` edits. Decisions D1–D17 apply; the header avatar is not interactive on `/account`.

</frozen-after-approval>

## Implementation Notes

**Remaining Story 7.1 work** (everything else is marked *built* in `epics.md` / FOUNDATION §5):
1. `app/account/page.tsx` — server component mirroring `app/page.tsx`: `requirePageSession()` (no session → `/auth`), `export const dynamic = "force-dynamic"`, `PortalUrlProvider` + `PageFrame page="account" header={<ProfileHeader />} idle={idle}` (no `saveOrder`/`saveAllSlot`), `AccountTabs personal={<AccountPersonalPanel account={<AccountSettingsSection />} authenticator={<AuthenticatorSection />} />} provider={<ProviderTab />} organizations={<OrganizationsTab />}`. The page never reads `lpl`. Copy already exists (`SHELL_MESSAGES.accountTab*`, `accountTabsLabel`, load error / no-access copy); add only page copy that is missing, in `lib/shared/messages/account.ts`.
2. `app/account.test.tsx` (Team B) — keep its tests; add: inactive tabs are not mounted and opening `?tab=personal` issues no `v2/user/npi` / `v2/user/organization/portal` request while opening a tab mounts only that tab (lazy, PNFR3); a 403 on the organizations read (test-only reader in the organizations slot using `keys.orgs()` + `StateFrame` + `forbiddenScopeFor(path, "account")`) shows the tab-level no-access panel while Personal Account still renders (PNFR11); `force-dynamic` exported by `app/account/page.tsx`; `/` → Account → Personal Profile issues one `myself` request (PNFR3, deferred-work Team B item). Keep `test/page-handlers/account.ts` the single place for `/account` read defaults.
3. `e2e/account-page.spec.ts` (fail-fast `test` + `mockAccountDefaults`): `/account?tab=organizations` with a session lands on that tab; without a cookie → `/auth` no-LPL screen; `/account?lpl=x` with a session renders the page with no `/api/token` call, without a session redirects to `/auth` with no query; refresh of `?tab=provider` reopens it; `?tab=PERSONAL`/`?tab=mfa`/repeated `tab` → Personal, normalized by replace; `#account`/`#authenticator` focus the Section `h2`, unknown hash or anchor on another tab stays at top; page nav from `/` → Account lands with `aria-current="page"` and no second `myself` request; Account item while on `/account` does nothing; tab order uses `expectHeaderTabOrder` (avatar not a stop on `/account`); axe light/dark at desktop and 360 px, no horizontal scroll, 44 px targets. The dirty-page-switch leave guard is already covered by `e2e/shell.spec.ts` "leave guard (fixture page)" — reference it, do not duplicate.
4. Planning: mark the two deferred-work Team B items about Story 7.1 (page switch 404, shared-cache assertion) resolved; sprint-status `7-1-…` → `done` after review; `epics.md` 7.1 gets a dated "built in spec-7-1-account-page" note.

**Verification:** `corepack pnpm lint && corepack pnpm typecheck`, `corepack pnpm vitest run --coverage`, `corepack pnpm test:e2e`, `corepack pnpm build`, `bash scripts/check-forbidden.sh` — all green.

### Implementation log (2026-10-15)

**Files changed**
- `app/account/page.tsx` (new): server component mirroring `app/page.tsx`; `dynamic = "force-dynamic"`, `requirePageSession()`, `PortalUrlProvider`, `PageFrame page="account" header={<ProfileHeader />} idle={idle}` (no `saveOrder`/`saveAllSlot`), `AccountTabs` with `AccountPersonalPanel account={<AccountSettingsSection />} authenticator={<AuthenticatorSection />}`, `ProviderTab`, `OrganizationsTab`. Never reads `lpl`. No new copy was needed (all page copy already exists in the shell catalog).
- `app/account.test.tsx`: now renders the route's own tree (`await AccountPage()`, `@/lib/server/page-session` mocked); existing tests kept; added `force-dynamic` export, lazy tabs (no `v2/user/npi` / `v2/user/organization/portal` request on `?tab=personal`; inactive panels empty; opening Provider mounts only it), organizations 403 (test-only `OrganizationsReader` in the test file: `useSWR(keys.orgs("", 0))` + `StateFrame` at the level `forbiddenScopeFor(path, "account")` gives → tab-level `NoAccess`, no Retry, Personal Account still renders both landmarks), `/` → Account → `/` one `myself` request, portal URL embedded.
- `e2e/account-page.spec.ts` (new): every item-3 scenario on desktop and mobile-360 (fail-fast `test`, `signIn`, `mockAccountDefaults`; `mockProfileDefaults` for the `/` hop). Waits for the h1 before reload, keyboard and clicks.
- `e2e/shell.spec.ts` (foundation): **human-approved exception to FOUNDATION §1 T2** — the page-switch (clean) and leave-guard Discard tests now expect `/\/account\?tab=personal$/` instead of `/\/account$/`. Reason: those assertions only held because `/account` was a 404; the real page normalizes a missing `?tab=` to `personal` by replace (`navigate({ page: "account" })` pushes `/account`).
- Planning: deferred-work Team B items (Story 7.1 placeholder, page-switch 404 / shared-cache) marked resolved in place; `epics.md` Story 7.1 has the dated "Built 2026-10-15" note.

**Decisions**
- "Fresh" for PNFR3 / the one-`myself` assertion means SWR's dedupe window (default 2 s after the last response; human-confirmed 2026-10-15, no foundation change). After that, a page switch revalidates `myself` in the background (no visible change). The unit test restores SWR's 2 s `dedupingInterval` inside `TestProviders` (which sets 0); with 0 it sees 2 calls, so the assertion is meaningful. The e2e clicks right after load, inside the window.
- The organizations 403 reader lives in the test file (no `orgs` loader is registered until Story 10.1), using an inline fetcher on `keys.orgs()`; it does not touch `features/organizations`.
- The page switch is unit-tested with a pathname-switching harness under one root SWR cache, rendering `/` with `ProfileTabs` defaults (placeholders) so the Team B test imports no Team A feature.

**Surprises**
- The foundation `e2e/shell.spec.ts` broke when the real page arrived (see the exception above).
- The page nav pushes `/account` (no `tab`); `PageTabs` then normalizes to `?tab=personal` by replace, so history gains one entry, as intended.

- **Review fixes (2026-10-15):** `app/account/page.tsx` exports `metadata.title = SHELL_MESSAGES.pageAccount` ("Account"; the layout default is "Personal Profile") + unit test; `recordRequests()` listeners removed in `afterEach`; the "Account while on /account does nothing" e2e waits 750 ms after the click before asserting no request/history entry. `epic-7-context.md` was regenerated by the bmad-build step-1 epic-context compile (planning had changed: D14–D17, F6/F7), not by hand. Verified: lint, typecheck, `vitest run --coverage` (3443 tests), build, check-forbidden, `e2e/account-page.spec.ts --repeat-each=3 --workers=2` (120/120), full `test:e2e` (337 passed, 3 skipped).

## Review Triage Log

Blind Hunter (one pass, 13 findings):
- medium — `/account` inherited the layout title "Personal Profile". Patched (`metadata.title` + test).
- low — `recordRequests()` leaked `request:start` listeners across tests. Patched (`afterEach` removal).
- low — "does nothing" e2e asserted before a late navigation could start. Patched (settle wait).
- low — sprint-status comment stale / spec still in-progress. Patched at finalize.
- low — `epic-7-context.md` rewrite not explained. Patched (note above); D7/D8 omitted because they concern Epic 10 (org-logo route) and cookie detection, not Epic 7.
- defer — `/account?lpl=x` with a session keeps `lpl` in the URL (the AC only requires that it is ignored and no exchange happens; the code is single-use). Deferred (Team B).
- defer — no page-level e2e for a non-403 tab/Section failure with Retry, a `myself` failure, or session expiry on `/account` (foundation `StateFrame`/`PageFrame` unit tests cover the behaviour; feature stories add reads). Deferred (Team B).
- false — "lazy-tab test can't fail": the inactive panels' `childElementCount === 0` assertions fail if tabs were force-mounted; only the request filter is vacuous until Epics 9/10 add reads.
- reject (low) — 403 test builds the tree instead of rendering the route: the route's slots are fixed stubs, so swapping the organizations slot requires the explicit tree; the route itself is rendered by the other tests.
- reject (low) — 360 px segmented control / hash-drop-on-tab-change / 1.5 s budget at page level: built and tested in the foundation (`shell.spec.ts`, `page-tabs`, `navigate` tests).
- reject — shared-cache proof limited to SWR's 2 s dedupe: matches the AC ("while the cached value is fresh"), confirmed by the human.
- reject (low) — extra unknown-hash encodings: `useHashAnchors` matches exact ids only (foundation tests).
- reject (low) — 44 px check covers only page-level controls: Sections are stubs; feature stories check their own controls.

