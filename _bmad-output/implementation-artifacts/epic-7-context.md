# Epic 7 Context: Account page and personal account settings

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Provide account details, verified sign-in contacts, regional preferences and partial-save recovery on `/account`, with independent tabs and safe portal hand-offs. Launches enter `/`; legacy portal menus stay unchanged.

## Stories

- Story 7.1: Account page — route, tabs, deep links and states
- Story 7.2: Account page hardening — denies, kill switch, headers, mobile and accessibility
- Story 7.3: Portal hand-off route
- Story 7.4: View Personal account settings
- Story 7.5: Edit names, birth date and regional preferences
- Story 7.6: Switch Primary email and phone

## Requirements & Constraints

- Require a session for `/account`; otherwise redirect to `/auth`. Ignore `lpl` here. Load tabs lazily and share identity data. Retry/403 restrictions stay within their owning frame/control; proxy denials remain generic.
- Preserve field order; exclude locked credentials from writes/drafts. Names require 1–24 trimmed printable characters; valid birth dates require age 18–120 (Proctors 21–120). Missing values show Not provided, except empty locale defaults to English - United States. Offer English, six approved US time zones and `en-US`; preserve unlisted stored values until changed and require blank language/time zone selections.
- Primary alternatives must be current Verified Email or Mobile contacts; exclude Landlines despite older PRD wording. Retain an unverified current primary as selected. Without alternatives, use a focusable disabled picker and guarded Contacts link; read view never fetches contacts. Send changed phone with its selected region; never resend unchanged email, after partial success.
- Save changed details, time zone and locale in that order; attempt later parts after ordinary failures, stop on session expiry. Keep partial failures in edit, identify failed parts and rebase successes so Retry sends only failures. Revalidate identity/contact data. No-change Save stays in edit; complete success clears the draft.
- Preserve security/no-store headers across navigation, RSC/prefetch, redirects and errors. `ACCOUNT_DISABLED` blocks Account/hand-off surfaces before upstream work while Personal Profile remains usable. Verify denies/traversal, WCAG 2.1 AA in both themes, 44 px targets, 360 px layout and 1.5-second tab content on demo broadband. Retain the documented rendered-page `Vary` limitation.

## Technical Decisions

- Reuse `docs/FOUNDATION.md` and story Foundation notes. Approved amendments override older acceptance/spine wording; preserve built Story 7.1 contracts.
- Use `callApi`, `/api/1h/*`, named ops and area allowlists; tag Account-only endpoints `profile: true`. Exclude time zone/locale from user-edit bodies; only Account may write login contacts. Reuse shared forms, states, save runner, navigation, drafts, copy/error mapping.
- **D18:** dev is optional; both `ONEHEALTH_SECRET_KEY_DEV` and `APP_ID_DEV` enable it, neither disables it, partial configuration fails boot. Dev uses `https://dev.1hdev.io`; detection is prod → demo → configured dev. Session controls traffic/links. Hand-off resolves session → configured remembered environment → prod; ignore remembered dev when disabled and reject query environment overrides. Scope dev drafts by environment; use logo initials pending origin confirmation.
- **D-A (approved):** every save path, including own Save and leave-guard Save, compares the rendered user with fresh `/myself`. Mismatch sends no write, invokes existing session expiry without logout and preserves edits under the original owner. Reuse the safeguard delivered through the Epic 1 foundation PR with both teams reviewing. Identity pins on first successful load until full reload; check every Account write. Leave-guard batch saves check once, falling back to individual checks after ordinary check failure; session failure stops. Missing pin or failed/malformed checks block writes; missing pin gives a retryable network error. Reads are unchecked; equal ids across environments are indistinguishable and check/write is non-atomic. D5 still excludes server binding, CSRF machinery and new session-change signals. Keep unreviewed mismatch copy marked draft.
- Hand-off is session-less GET, absolute 303; other methods return 405. Validate destination/numeric tenant id; invalid input and unconfirmed tenant URL shape use portal root. Creation uses `/organizations/create`. No tenant switching, refresh/logout, cookie writes or query forwarding/logging; guarded navigation keeps drafts/session.
- Team B owns Account/hand-off and area modules/tests. Shared additions ship first in foundation PRs; Team A's personal allowlist stays read-only. Maintain ownership/layer/token gates and test defaults.

## UX & Interaction Patterns

- Personal Account, Individual Provider Registration and My Organizations tabs activate manually. Invalid/repeated tab parameters default to Personal Account; deep links focus headings. Shared header, noninteractive avatar, one-column content; no Section menu, Jump to or Save all.
- Tables pair fields row by row; below 768 px stack fields with 16 px gutters and scrolling tabs, without page overflow. Edit focuses First name; invalid Save focuses its first error, success the heading, Cancel the Edit trigger. Enter/Escape do not submit/cancel. Birth-date help is edit-only; primary changes show notices immediately without confirmation.
- Dirty navigation uses the shared leave guard; partial Save prevents departure. Scope drafts by environment/user/account; invalidate changed baselines and recheck restored primaries against Verified options. Return to 1health uses logout/purge; hand-off retains drafts. Respect reduced motion and accessible announcements.

## Cross-Story Dependencies

- Epic 1 supplies foundation/D-A; completed reworks are not prerequisites to rebuild. Sequence: 7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6; 7.2 needs only 7.1, and 7.3 is independent of account editing.
- Epics 8–10 fill Account slots; portal exits depend on 7.3. Shared time-zone additions land first as foundation work.
- Confirm tenant URL shape and login-email token survival on demo; retain root fallback and normal expiry handling. Missing permissions remain scoped no-access states.
