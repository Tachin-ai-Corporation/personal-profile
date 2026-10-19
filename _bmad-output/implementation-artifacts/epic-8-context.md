# Epic 8 Context: Authenticator app (MFA)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let launching users inspect their authenticator status, link an authenticator by scanning a QR and validating a code, and deliberately turn it off from the Personal Account tab. Preserve existing platform behavior: this app manages the TOTP factor only; base MFA remains managed outside the app.

## Stories

- Story 8.1: Authenticator status and app tiles
- Story 8.2: Link an authenticator app
- Story 8.3: Turn off the authenticator app

## Requirements & Constraints

- The authenticator card belongs below account settings at `/account?tab=personal#authenticator`. It has no editable Section lifecycle, dirty state, Save, draft or Save all participation.
- Derive linked status only from `myself.totpEnabled`; `mfaEnabled` alone does not mean an authenticator is linked. All five vendor tiles link the same TOTP factor. Existing base-MFA prerequisites and permissions still apply.
- Never enable or disable base MFA. Recovery codes, manual secret entry and reauthentication before disabling are outside scope. Turning off TOTP always requires explicit confirmation.
- QR creation rotates the secret. Start it only from user activation, once per linking attempt, with single-flight protection. Rendering, effects, repeated activation and validation failures must not request another QR. A later reopening gets a fresh QR; only the latest response may be rendered.
- QR data and verification codes remain in transient dialog state. Clear them on close, unmount and `pagehide`; exclude them from URLs, caches, SWR, drafts, browser storage, telemetry and logs. Browser validation carries the code in a JSON POST body; only the server translates it into the upstream query parameter.
- Do not automatically retry failed MFA mutations after network errors, timeouts or server failures. Refresh shared account status after linking, disabling and closing enrollment.
- Prove the complete link, invalid-code, base-MFA-unavailable and confirmed-disable flows; include duplicate-activation and StrictMode coverage, privacy checks, and keyboard/axe checks in both themes at desktop and 360 px.

## Technical Decisions

- Browser traffic uses `callApi` through the BFF. TOTP enable and disable use their narrowly allowed `POST v2/mfa/{enable,disable}/totp` routes, with no query or body and account kill-switch tagging. Generic MFA enable/disable and direct validation passthrough remain denied.
- Validation uses the existing authenticated named operation `POST /api/pp/mfa/validate`, accepting only JSON containing a six-digit code and returning the upstream boolean with private, no-store caching. A successful HTTP response containing `false` is an invalid code, not a transport error. Preserve the current security decision: JSON enforcement applies; no CSRF or session-binding check is added.
- Reads share `myself`; enrollment and disabling are imperative mutations outside SWR. Reuse foundation contracts and primitives instead of recreating transport, session handling, dialogs, status/error rendering or toasts.
- Route failures through the authenticator error mapper. Base-MFA-unavailable responses produce an actionable information notice; an already-enabled response refreshes status. Upstream permission denial replaces only the authenticator card with its no-access state. A proxy denial must not become a user-permission state; session expiry belongs to the shell.
- Keep approved copy in the MFA message catalog, reuse common actions, and mark unapproved fallback copy as draft. Match upstream text only in the MFA error mapping layer. User-safe fallback messages cover failures without usable platform copy.
- Record only `mfa_link { ok, attempt }` for boolean validation outcomes, with attempts counted from one for each dialog opening. No code, QR, vendor name or user identifier enters telemetry; its sink remains a no-op until an approved sink exists.
- Team B owns this epic. Keep story changes within Team B and its MFA area files; shared changes require a separate foundation PR merged first. Confirm upstream TOTP lockout on demo. If absent, add a sealed-session counter or edge rate limit through the shared foundation rather than a feature-specific limiter; throttling remains an unresolved prerequisite decision.

## UX & Interaction Patterns

- Present an unlinked status or an enabled check/status with a destructive-outline Disable action. Linked tiles stay focusable but inert, with a visible explanation and equivalent tooltip. Loading, retryable read failures and permission denial must have explicit states.
- The vendor order is Google, Microsoft, Authy, DUO, Android OTP. Use decorative same-origin logos. The tiles form one row from 768 px and a three-column grid below it. Use semantic tokens, 44 px targets, reduced-motion behavior and no horizontal overflow at 360 px; vendor logos are the permitted color exception.
- Linking shows the activating tile's busy state before opening a dialog. Keep the QR on a white surface in either theme. Use one labeled numeric, six-digit input with one-time-code autocomplete, inline announced errors and trapped initial focus. Short input sends nothing; an invalid code clears the field while retaining the QR; other validation failures retain both for a deliberate retry.
- Success shows a toast and moves focus to the card heading. Cancelling enrollment returns focus to its tile without another MFA call. Base-MFA-unavailable information receives focus and leaves the tiles available.
- Below 768 px, only the linking dialog becomes full-screen, with a scrolling body and pinned actions. The disable confirmation stays centered with gutters, starts focus on Cancel, and returns focus to its trigger on cancellation or the card heading after success.

## Cross-Story Dependencies

- Epic 1 supplies authenticated transport, shared status, error mapping, dialogs, toasts and proxy denial rules. Epic 7 supplies the account page, Personal Account placement, anchor handling and account hardening.
- The status card provides the shared status, loading and card-level permission states consumed by linking and disabling. Both mutation flows must reconcile through the same account-status read.
- Vendor assets come from the legacy application; their license review remains open. Shared MFA throttling and mobile footer behavior under the on-screen keyboard require foundation coordination.
