# Epic 7 Context: Account page and personal account settings

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Provide `/account` with Personal Account, Individual Provider Registration and My Organizations tabs, allowing users to maintain account details and verified login contacts with explicit partial-save recovery. Supply safe portal hand-offs and accessible, independently failing account surfaces. The existing portal user menu stays unchanged; launches enter `/`, then users select Account.

## Stories

- Story 7.1: Account page — route, tabs, deep links and states
- Story 7.2: Account page hardening — denies, kill switch, headers, mobile and accessibility
- Story 7.3: Portal hand-off route
- Story 7.4: View Personal account settings
- Story 7.5: Edit names, birth date and regional preferences
- Story 7.6: Switch Primary email and phone

## Requirements & Constraints

- `/account` requires a session, redirects to `/auth` without one and ignores `lpl`. Tabs load lazily; invalid/repeated tab parameters normalize to Personal Account. Account and authenticator anchors focus their headings. Failures and Retry stay within the affected frame; upstream 403 follows the shared ownership table, including picker-only restrictions. Proxy denials remain generic errors.
- Preserve account parity. Username/password remain locked and never enter writes or drafts. Reuse trimmed-name and role-sensitive birth-date rules (18–120; Proctor 21–120). Missing/unusable values read as Not provided, except empty locale defaults to English - United States. Preserve unlisted regional values until changed; offer English, the six approved US time zones and `en-US`.
- Changed primaries must be current Verified Email or Mobile options; exclude Landlines. Keep the current primary selected even if unverified. No alternative means a focusable disabled picker with a guarded Contacts link. Never resend an unchanged email; send phone and its selected region together. Account read view adds no contact-list fetch.
- Save changed details, time zone and locale in order, attempting remaining parts after ordinary failures; stop on session expiry. Keep partial failures in edit, name failed parts and rebase successful fields so Retry sends only failures. Revalidate shared identity/contact data. No-change Save stays in edit; successful Save clears the draft.
- Preserve strict security/no-store headers on navigation, RSC/prefetch, redirects and errors. `ACCOUNT_DISABLED` blocks Account and hand-off surfaces before upstream work while Personal Profile remains usable. Verify deny/traversal coverage and WCAG 2.1 AA in both themes, desktop and 360 px; targets are at least 44 px and first-tab content meets the 1.5 s target.

## Technical Decisions

- Read `docs/FOUNDATION.md` before implementation. Reuse F1–F7. Later human decisions/amendments override older spine/acceptance wording; later spec corrections and code resolve stale foundation notes. Story 7.1 is built; preserve its contracts.
- Compose through `requirePageSession`, `PageFrame`, `AccountTabs`, `AccountPersonalPanel` and feature entry points. Reuse `StateFrame`, `forbiddenScopeFor`, `useSectionFrame`, `useClaimMyselfError`, the complete `Myself` domain and shared SWR keys.
- Forms use `useSectionForm`, Section chrome, `KeyValueTable`/`KeyValueEditTable`, shared controls and shell toasts. Account multi-request saves use `runSaveSteps` with `attemptAll`. Reuse person/date/phone rules, shared labels, `PersonalInformationPayload` and draft restore/conflict handling; cross-page changes invalidate drafts through their baseline hash.
- Browser traffic uses `callApi` from `@/lib/api`; REST uses `/api/1h/*`, server orchestration uses named ops. Add endpoints only to their area allowlist, tagging account-only endpoints `profile: true`. Keep locale/time zone out of the user-edit body. Copy belongs in area message catalogs; errors use `mapApiError`, with upstream text matching confined to area error modules.
- **D18:** optional dev requires both `ONEHEALTH_SECRET_KEY_DEV`/`APP_ID_DEV`; partial configuration fails boot. Dev uses the shared map (`https://dev.1hdev.io`). Session environment controls Account links and traffic; session-less hand-off resolves session → configured remembered environment → prod. Ignore remembered dev when disabled; never accept an environment query override. Keep dev drafts environment-scoped; dev logos show initials until their origin is confirmed.
- **D-A:** reuse the built save safeguard. First successful `myself` pins the page user until full reload. Each data write through `callApi` checks fresh identity; mismatch sends no write and invokes existing session expiry without logout, preserving drafts under the pinned owner. Missing pin or failed/malformed check blocks the write; missing pin gives network error with Retry. Account Save checks each write; leave-guard `runSaveAll` checks once per batch, falling back to per-write checks on ordinary check failure and stopping on session failure. Reads are unchecked, matching ids across environments are not distinguished, and checks/writes are not atomic. D5 still forbids server session binding, CSRF machinery and new session-change signals.
- Hand-off: session-less GET, 303 via `seeOther`; other methods 405. No refresh/logout/upstream calls, cookie writes or query logging. Validate destination/numeric tenant id; invalid input falls back to portal root. Tenant shape stays root pending confirmation; create-org uses the fixed portal path. Reuse `handoffHref`/guarded `navigate`.
- Team B edits its owned Account/hand-off/features, area modules and tests. Shared additions require a separate foundation PR merged first; shared contracts are add-only. Team A's personal allowlist stays read-only. Keep layering/token/forbidden gates green and Team B read defaults complete.

## UX & Interaction Patterns

- Shared app bar/header, manual-activation tabs and one-column content; no Section menu, Jump to or Save all. Header avatar is noninteractive on Account. Below 768 px use 16 px gutters, a scrolling tab strip and stacked fields without page overflow.
- Edit in place, initially focus First name; invalid Save focuses the first error, success the heading, Cancel the Edit trigger. Enter/Escape do not submit/cancel. Birth-date help appears only in edit. Primary changes show persistent inline notices without confirmation.
- Dirty tab/page/portal navigation uses the shared leave guard; partial Save prevents navigation. Hand-off keeps drafts/session; Return uses the existing logout/purge flow. Respect reduced motion and accessible error announcements.

## Cross-Story Dependencies

- Epic 1 foundation precedes this epic. Sequence: 7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6; 7.2 needs only 7.1, and hand-off is independent of account editing.
- Epics 8–10 fill the existing feature slots; provider/organization portal actions depend on 7.3. Shared time-zone additions must land as foundation work before consumers.
- Confirm tenant portal URL shape and login-email token survival against demo; retain documented fallback/session behavior until resolved.
