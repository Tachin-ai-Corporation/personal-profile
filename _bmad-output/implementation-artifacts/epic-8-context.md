# Epic 8 Context: Authenticator app (MFA)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give users an "Authenticator app" card on the `/account` Personal Account tab where they can see whether a TOTP authenticator is linked, link one by scanning a QR code and entering a 6-digit code, and turn it off after confirming. This matches the legacy 1health-fe behavior exactly: the app only ever touches the TOTP factor and never turns base MFA on or off. The card is a standalone container below Personal account settings. It is not an editable registry Section, so it has no dirty state, draft or Save.

## Stories

- Story 8.1: Authenticator status and app tiles
- Story 8.2: Link an authenticator app
- Story 8.3: Turn off the authenticator app

## Requirements & Constraints

- **Status:** derived only from `myself.totpEnabled`, read through the shared `["pp","myself"]` SWR key, with no extra fetch on mount. `mfaEnabled` is read but never shows "Enabled" on its own. Enabled shows a check, "Enabled" and a "Disable" button. Not enabled shows a muted "Not set up".
- **Tiles:** five tiles in this order: Google, Microsoft, Authy, DUO, Android OTP. They are presentational, and every tile links the same TOTP factor. While TOTP is enabled the tiles are `aria-disabled` (they stay focusable) and show the caption and Tooltip "Disable the current authenticator to link another". Activating one then does nothing.
- **Link flow:**
  - A tile click calls `enable/totp` exactly once (single-flight) and opens a QR dialog with one numeric code field.
  - Fewer than 6 digits shows an inline error and sends nothing.
  - Validate `true` closes the dialog, shows a toast, revalidates `myself` and focuses the card's `h2`. Validate 200 `false` means an invalid code (not an error): clear the field and keep the dialog open with the same QR.
  - Cancel or Escape revalidates `myself` and returns focus to the tile.
  - "Mfa is not enabled…" or "Mfa config is missing." shows a focused info notice and no dialog. "Totp is already enabled." refetches `myself`.
- **Disable flow:** a confirm dialog is always shown ("Turn off authenticator app?"). Confirming calls only `disable/totp`. Success shows a toast, revalidates `myself` and focuses the `h2`. Cancel sends nothing and returns focus to "Disable".
- **Errors:**
  - Show the platform `message` when present, otherwise the draft fallback copy.
  - Never auto-retry or replay after a 5xx or timeout, and there is no Retry that re-requests the QR.
  - `SESSION_EXPIRED` shows no card error, because the shell dialog handles it. There is no `SESSION_CHANGED` (D5).
  - A non-403 load error on `myself` shows the standard load-error banner with Retry, which revalidates only `myself`.
- **No access:** an upstream `FORBIDDEN` (a 403 without `source:"proxy"`) on any `mfa/*` call or `/api/pp/mfa/validate` replaces the card body with the Section-level no-access row. Other cards and tabs keep working. A proxy `NOT_ALLOWED` is never shown as no access (there is no `CSRF`, D5).
- **Privacy (hard rule):**
  - The QR data URI and the code live only in the dialog's React state, never in SWR, drafts, storage, URLs, logs or telemetry, and are cleared on close, unmount and `pagehide`.
  - The code travels only in a POST body.
  - Telemetry emits only `mfa_link { ok, attempt }`.
- **Copy:** every string is a key in `lib/shared/messages.ts`, verbatim from the EXPERIENCE.md Voice and Tone section and the Profile addendum copy table. Fallback error strings are marked `// DRAFT COPY`.
- **Quality:**
  - WCAG 2.1 AA with keyboard-only completion, focus trapped in dialogs and returned on close, and 44 px targets.
  - No horizontal scroll at 360 px.
  - Axe passes in light and dark.

## Technical Decisions

- **Files:**
  - `features/mfa/authenticator-card.tsx` and its dialogs
  - `lib/api/mfa.ts`, which exports `enableTotp()`, `validateTotp(code)` and `disableTotp()` via `callApi` with contexts `"mfa/enableTotp"`, `"mfa/validateTotp"` and `"mfa/disableTotp"`. These calls bypass the SWR fetcher.
  - Story 8.1 adds `totpEnabled` and `mfaEnabled` to the `lib/api/myself.ts` domain type.
- **Proxy allowlist:**
  - Story 8.2 adds `POST v2/mfa/enable/totp` and Story 8.3 adds `POST v2/mfa/disable/totp`. Both take no query and no body and are tagged `profile: true`, so the `ACCOUNT_DISABLED` kill switch covers them.
  - These denies must still hold: `POST v2/mfa/enable`, `POST v2/mfa/disable`, `* v2/mfa/{enable,disable,validate}/<n>`.
  - `v2/mfa/validate` is never a passthrough entry.
- **Named op `POST /api/pp/mfa/validate`:**
  - Lives in `app/api/pp/mfa/validate/route.ts` with `force-dynamic`.
  - Requires a session and `Content-Type: application/json` (else 415). There is no CSRF or `X-PP-Session` check (D5).
  - The body `{code}` must match `^\d{6}$`. Otherwise it returns 400 `BAD_BODY` and makes no upstream call.
  - The server calls upstream `v2/mfa/validate?code=`, returns the boolean, and sets `Cache-Control: private, no-store, max-age=0`.
- **Single-flight:** `enable/totp` fires from the tile's click handler, never from a mount or render effect, so it is safe under StrictMode. An in-flight ref makes double clicks a no-op. The dialog renders only the QR from the latest response, and each new dialog open gets a fresh QR.
- **Error mapping:** happens only in `lib/api/errors.ts`, through its exact-message table:
  - "Mfa is not enabled for this user." and "Mfa config is missing." map to `MFA_NOT_ENABLED`.
  - "Totp is already enabled." maps to `TOTP_ALREADY_ENABLED`.
  - An upstream 403 maps to `FORBIDDEN`.
- **Other changes:**
  - The dev-only `logApiCall` console logger (D6) already redacts `qrCode` and `code`; a test asserts it.
  - `app/globals.css` gains a `qr-surface` token that is white in both themes.
  - Vendor logos are same-origin PNGs in `public/mfa/` (copied from `1health-fe/src/assets/mfaAppsLogos/`) and are the only non-token colors.
- **Tests:** Vitest, RTL and MSW for the card and flows, proxy-table rows and route tests for the named op, and Playwright against a mocked proxy for parity row 7 (link, and disable with confirmation).

## UX & Interaction Patterns

- **Card:**
  - The `section#authenticator` has an `h2` "Authenticator app" with `tabIndex={-1}`, so it can receive focus. The deep link `#authenticator` scrolls to it.
  - Loading shows five 112 px tile skeletons, which are static under reduced motion.
- **Tiles (`mfa-tile`):**
  - Each tile is a native `button` (112 px square, 48 px logo, name below) with the accessible name "Link {App}" and `aria-haspopup="dialog"`.
  - Inactive tiles use opacity 0.55.
  - At 768 px and wider the tiles sit in one row. Below that they form a 3-column grid, with tiles at least 96 px.
- **QR dialog (`qr-dialog`):**
  - 440 px wide, with a 184 px QR on `qr-surface` inside a border frame.
  - The `otp-input` is 200 px, mono, `inputmode="numeric"`, `autocomplete="one-time-code"`, digits only, max 6.
  - Focus starts in the field. Enter submits.
  - Below 768 px the dialog is a full-screen sheet with Cancel and Submit pinned at the bottom. It is the only full-screen dialog on `/account`.
- **Disable confirm:** focus starts on Cancel, and "Turn off" uses `button-destructive`. It stays a centered dialog on mobile, with 16 px gutters. The "Disable" trigger is `button-outline-destructive`.
- **Spinners and banners:**
  - While a request is in flight the active tile shows a spinner with `aria-busy` and the other tiles become `aria-disabled`.
  - Notices and errors appear as an `inline-banner-info` or `inline-banner-error` above the tiles.

## Cross-Story Dependencies

- **Order:** 8.1 builds the card, the status, the tiles, and the no-access and loading states. 8.2 and 8.3 set the no-access state from their calls and rely on the 8.1 rendering. 8.2 and 8.3 are otherwise independent.
- **Status:** Epic 1 (foundation) is **not implemented**. Epic 7 is being built first and creates the minimal foundation Epic 8 needs. Before you start Epic 8, check that each piece below exists, and build any missing piece minimally inside Epic 8.

| Area | What Epic 8 needs | Where it comes from |
|---|---|---|
| Page | The `/account` route with Personal Account as a deep-linkable tab | Story 7.1 |
| Page | The `authenticator` container slot below the Account Section | Story 7.1 |
| Page | `#authenticator` hash-anchor scrolling | Story 7.1 |
| Page | The app bar | Story 7.1 |
| States | `features/account/account-state-frame.tsx`, with the five-tile skeleton variant, the load-error banner and Retry | Story 7.1 |
| States | The `no-access-panel` | Story 7.1 |
| States | `features/account/forbidden-scope.ts`, where the `mfa/*` row maps to the Authenticator card | Story 7.1 |
| Data | `lib/api/myself.ts` domain module on the shared `["pp","myself"]` key | Story 7.4, built on Epic 1 Story 1.4 `fetchMyself`, `lib/api/keys.ts` and the shared SWR fetcher |
| Transport | `callApi` going through the allowlisted `/api/1h/*` proxy | Epic 1 Stories 1.3 and 1.4, minimal version in Epic 7 |
| Transport | The proxy deny list, including all MFA denies (defined in Story 1.3; deny and traversal test rows against Profile templates in Story 7.2) | Stories 1.3, 7.2 |
| Transport | The 415 JSON content-type check (no CSRF or `X-PP-Session`, D5) and no-store headers | Epic 1 Stories 1.3 and 1.4, minimal version in Epic 7 |
| Transport | `ApiResponse` carrying `errorCode`, `upstreamCode` and `source` | Epic 1 Stories 1.3 and 1.4, minimal version in Epic 7 |
| Transport | Session events (`session-expired` only; no `session-changed`, D5) | Epic 1 Stories 1.3 and 1.4, minimal version in Epic 7 |
| Kill switch | `ACCOUNT_DISABLED` 503 for `/api/pp/mfa/**` (route level, Story 7.2) and for entries tagged `profile: true` (proxy level, Story 1.3) | Stories 1.3, 7.2 |
| Errors | `lib/api/errors.ts`, with upstream 403 → `FORBIDDEN` and the "platform message, else generic" rule | Story 7.1 (Epic 1 Story 1.12) |
| Errors | The MFA exact-message rows (`MFA_NOT_ENABLED` and `TOTP_ALREADY_ENABLED`) | Add them in Story 8.2 if Epic 7 didn't |
| Shared UI | The toast system | Epic 1 Story 1.12 |
| Shared UI | `lib/shared/messages.ts` and the V&T verbatim test | Epic 1, extended by Epic 7 |
| Shared UI | `lib/shared/telemetry.ts` (no-op sink) | Epic 1 (AD-15); create it if it is missing |
| Shared UI | The dev-only `logApiCall` redaction list (D6) | Epic 1 Story 1.4 |
| Shared UI | Tokens (`status-verified` and the destructive button variants) | Epic 1 Story 1.8 |
| Shared UI | shadcn Dialog and Tooltip | Existing UI library |
| Test tooling | Vitest, Testing Library, MSW, Playwright and `@axe-core/playwright` | Epic 1 Story 1.1. **The repo has no test framework today**, so confirm Epic 7 added them or add them. |
| Shell | Session-expired dialog, so MFA errors can skip that case (no session-changed dialog, D5) | Epic 1 Story 1.7. If it is missing, still suppress card errors for that code. |

- **Open platform question:** whether every user has base MFA (OQ2, which was due to be verified on demo by 2026-10-20). If they don't, the `MFA_NOT_ENABLED` notice covers it.
