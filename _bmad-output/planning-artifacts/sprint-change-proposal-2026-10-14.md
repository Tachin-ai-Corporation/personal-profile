# Sprint Change Proposal: Epic 1 rework for the 2026-10-13/14 planning updates

- **Date:** 2026-10-14
- **Branch:** `feat/NG-9027-epic1-foundation`. It was cut from `6974a8f`, which is our branch rebased onto `main` at `0819446`, after PR #3.
- **Mode:** batch.
- **Status:** approved by the user on 2026-10-14. Q1: (a) R1 covers 1.1 + 1.2. Q2: staged bans, each rework story bans what it removes.
- **Scope:** moderate (backlog reorganisation, implemented by the developer). D5 point 3 still awaits the epic owner's confirmation.

## 1. Issue summary

Stories 1.1–1.8 were built and reviewed against the planning of 2026-10-13 (before the Profile module). Two planning merges on `main` then changed decisions those stories already implement:

- **PR #2 (`d7d3ff4`):** the architecture spine update (AD-1–AD-26) and "Amendments to Epics 1–5". It adds the Profile/Account module (Epics 7–10).
- **PR #3 (`0819446`):** human decisions **D1–D13** (2026-10-14, `epics.md` lines 628–650). They override the spine. Every Epic 1 story was amended in place, and the amended story text is authoritative.

- **Type:** a new requirement or strategic change from stakeholders. It is not an implementation defect.
- **Evidence:** the code still passes every check (lint, typecheck, 669 unit tests, 66 e2e tests, build) because the tests assert the old design. Section 2 lists the contradictions with file and line.

## 2. Impact analysis

### 2.1 Built code that the amended stories contradict

| Story | Superseded in code | Governing decision |
|---|---|---|
| 1.1 | `env.ts`: `APP_ENV`, `APP_ORIGIN`, `APP_ID`, `ONEHEALTH_SECRET_KEY`, derived `API_ORIGIN`/`PORTAL_ORIGIN`/`PORTAL_URL`. CSP `frame-ancestors <portal>`, no `X-Frame-Options`, COOP `same-origin-allow-popups` (`proxy.ts:54,66-68`). Forbidden gate bans every `_DEMO`/`_PROD` name. Header spec asserts the old values. | D1, D2, D4, D10, AD-21 |
| 1.2 | `/launch`, `/launch/verify`, `/launch/dev`, `/launch-error` and the `proxy.ts` `?lpl` 307. Single-key decrypt. Relative redirects. Cookie `SameSite=None; Partitioned` (`session.ts:45`). `reason=cookies` / new-tab fallback. Tenant copy. | D1, D2, D8, D9, D10, AD-1, AD-6 |
| 1.3 | CSRF and binding checks in the proxy (`csrf.ts`, `session-binding.ts`). Error body `{code}`. Prefix-only deny list. No `preview=true`. `URLSearchParams` query encoding. No `ACCOUNT_DISABLED` / `profile: true` tag. | D5, D6, D12, AD-2, AD-19 |
| 1.4 | `X-PP-Session` header and `sessionBinding`. `session-changed` publishing. No `upstreamCode` / `source` parsing. No root `SWRConfig`. No dev `logApiCall`. | D5, D6, AD-10, AD-19 |
| 1.5 | Refresh route CSRF and binding. `{code}` bodies. Replay is not limited to a proxy-originated `TOKEN_EXPIRED`. | D5, AD-16, AD-19 |
| 1.6 | Ping CSRF and binding. Proxy activity re-seal requires a verified binding. `/account` load isn't counted as activity. | D5, AD-16 |
| 1.7 | Logout calls `/auth/user/logout` after the response; D3 wants `all-devices` first, and GET accepted. Session-changed dialog and `onSessionChanged`. Framed "Close and reopen". `returnToPortal()` instead of `navigate()`. No login-intent save on expiry. | D3, D4, D5, D10, AD-26 |
| 1.8 | Title instead of the page nav (Personal Profile \| Account). Framed hiding of Return. Wordmark hidden below 768 px. `dark:text-info-strong` instead of a `primary-text` token. Tabs call `requestLeave()` directly. `TabId` instead of `ProfileTab`. Old tab order. | D10, D11, D13, AD-26 |

### 2.2 Epic impact

- **Epic 1:** can be completed with a rework of 1.1–1.8. No story is removed or renumbered.
- **Epic 7 (7.0a/7.0b shell foundation, then 7.1):** builds on our `features/shell`. The epic owner has confirmed this. It depends on the reworked 1.7/1.8 and on Stories 1.11–1.13, which are not started yet.
- **Epics 2–5:** the amendments are already in their story text (per-type contact-point keys, error envelope, `preview=true`, `person-rules.ts`). No action until those stories are built.
- **Epics 8–10:** depend on Epics 1 and 7 only. No change.

### 2.3 Artifact conflicts

- **PRD (Personal Profile):** no MVP change. NFR7, NFR9, NFR11 and NFR12 are superseded per the amendments list.
- **Architecture spine:** decisions D1–D13 override it, but its text still describes the old model. AD-3 and AD-20 still list `PORTAL_URL`/`PUBLIC_FILES_ORIGIN` as env vars, and AD-17 still describes CSRF and binding. Section 4.2 proposes dated supersede notes.
- **UX (DESIGN / EXPERIENCE):** already updated by PR #3 (D11, D13). No change needed.
- **Other:**
  - `CLAUDE.md` describes the superseded model. It needs rewriting with each rework story.
  - The planned `.env.example` (`deferred-work.md`) must list the D1 variables.
  - CI and Playwright dummy env values change.
  - `sprint-status.yaml` has no Epic 7–10 keys.
  - The four Epic 1 specs (`1-1`, `1-2`, `1-7`, `1-8b`) describe the framed model. They stay as historical records; the rework specs supersede them.

### 2.4 Epic 1 context

`epic-1-context.md` was recompiled on 2026-10-14 from the amended Epic 1 and D1–D13. Its timestamp alone could not show that the old copy was stale, because the rebase rewrote the file after the planning changes.

## 3. Recommended approach

**Direct adjustment (Option 1).** Add rework stories inside Epic 1 that bring the built code to the amended story text, then build Stories 1.11–1.13, then continue with 1.9, 1.10 and 1.14–1.16.

- **Rollback (Option 2):** rejected. Most of the code survives (proxy core, refresh single-flight, idle timer, tokens, shell layout, `SectionFrame`), and reverting it would discard reviewed work.
- **MVP review (Option 3):** not needed. Scope is unchanged.

**Effort:** high in total (four rework stories, then three new ones). **Risk:** medium. Launch and session code is security-relevant and gets the full review loop. **Timeline:** Epic 7's 7.0b waits for R3/R4 and 1.11–1.13.

### 3.1 Rework sequence

Each rework story runs through `bmad-build`: spec, approval, implementation, three-layer review, full checks.

1. **R1: Foundation and launch (Stories 1.1 + 1.2).** Story 1.1's rework comes first, as requested. It is combined with 1.2 because 1.1's env change can't land alone (see decision Q1).
   - Rebuild `env.ts` with the D1 variables, `getSecretKey(env)` and `getAppId(env)`.
   - Add `lib/shared/environments.ts` and `lib/shared/app-env.ts`, and add `environment` to the sealed session.
   - Every upstream caller (proxy, refresh, ping, logout) takes `apiRoot`/`apiBase` from the session's environment.
   - Add the `/auth` client screen (D9) and `POST /api/token` (D2, D9).
   - Delete `/launch*`, `/launch-error` and the `?lpl` 307. With no session, pages redirect to `/auth`.
   - Cookie `SameSite=Lax`, no `Partitioned`.
   - Headers: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, COOP `same-origin`.
   - Remove every framed branch (`useIsFramed`, framed copy, new-tab fallback). D10 is done entirely here.
   - Add `lib/server/http.ts#seeOther()` and the lint and forbidden-gate rules for what R1 removes.
   - Add `.env.example`, and update CI and Playwright env, the header and launch e2e, and `CLAUDE.md`.
2. **R2: Transport and proxy (Stories 1.3–1.6).**
   - D5: remove `csrf.ts`, `session-binding.ts`, `X-PP-Session`, `sessionBinding` and `SESSION_CHANGED`. The proxy re-seals activity on `X-PP-Activity: user` with no binding requirement (amended 1.6).
   - Error bodies become `{errorCode, source:"proxy"}`, and `callApi` adds `upstreamCode`/`source` parsing.
   - Exact deny list, `profile: true` tag and `ACCOUNT_DISABLED` 503 (D12). `preview=true` on `asImage` entries. `encodeURIComponent`. Keep the 415 check.
   - Root `SWRConfig` in `app/layout.tsx`. Replay a non-GET only after a proxy `TOKEN_EXPIRED`.
   - Add `logApiCall` (D6).
   - Forbidden-gate rules for `X-PP-Session` and `sessionBinding`.
3. **R3: Logout and session-expired dialog (Story 1.7).**
   - D3 logout: `all-devices` first and best-effort, then 204 and a cleared cookie; GET accepted.
   - `features/shell/navigate.ts` with the `{ external: "portal" }` path: guard → before-exit callbacks → logout → same-tab `location.assign`.
   - After expiry, "Return to 1health" resolves the environment from the session, else the `onehealth_environment` cookie, else prod (D4).
   - Remove the session-changed dialog and hook (D5). Save the login intent on expiry.
4. **R4: App bar and shell (Story 1.8).**
   - Page nav Personal Profile | Account with `aria-current="page"`; a segmented control below 768 px that wraps below 400 px.
   - Wordmark as a `primary-text` span on every width (D11, D13). Add the `primary-text` token and drop the ad hoc `dark:text-info-strong`.
   - New tab order. Tabs and page switches go through `navigate()`. `ProfileTab` type.
   - AD-26 navigation lint. The Account item may point at `/account` before Epic 7 ships.
5. **Stories 1.11, 1.12, 1.13** (new, from their amended text): Section framework (per-page registry), error mapping and message catalog (`FORBIDDEN`, exact-message table, no `CSRF`/`SESSION_CHANGED`), and the leave guard driven by `navigate()`. Epic 7's 7.0b depends on all three.
6. **Then continue:** 1.9, 1.10, 1.14, 1.15, 1.16.

## 4. Detailed change proposals

### 4.1 Backlog (`sprint-status.yaml`)

- **Add** rework entries under Epic 1, status `backlog`:
  - `1-1r-foundation-and-launch-rework`
  - `1-3r-transport-and-proxy-rework`
  - `1-7r-logout-and-session-expired-rework`
  - `1-8r-app-bar-and-shell-rework`
- **Keep** `1-1`…`1-8` at their current status. The reworks are tracked separately so the original reviews stay traceable.
- **Add** Epics 7–10 and their stories with status `backlog` (checklist 6.4). Running `bmad-sprint-planning` produces them from `epics.md`.
- **Applied 2026-10-14** after approval.

### 4.2 Architecture spine (dated notes; no rule rewrites)

AD-3/AD-4/AD-20, AD-17 and AD-5 are superseded by D1/D2/D4, D5 and D10. Add a dated note under each. For AD-17:

```
OLD (AD-17 Rule): Every non-GET request ... must have Sec-Fetch-Site: same-origin ... and X-PP-Session; otherwise 403 CSRF ... 409 SESSION_CHANGED.
NEW (appended): *Superseded 2026-10-14 by D5 (epics.md), accepted by the epic owner Daniel Garcia — see "Accepted decision: D5".*
```

**Rationale:** the spine is read by every planning skill. Without the notes, a later spec could rebuild CSRF and binding from AD-17.

### 4.3 Accepted decision: D5 (epic owner Daniel Garcia, 2026-10-14)

There are no CSRF or session-binding checks: no `Sec-Fetch-Site`/`Origin` check, no `X-PP-Session`, no HMAC binding, no 403 `CSRF`, no 409 `SESSION_CHANGED`. The epic owner accepts these risks knowingly:

1. **Cross-site writes:** they are blocked only by `SameSite=Lax` on `__Host-pp_s`. Lax withholds the cookie on cross-site POST/PUT/DELETE and sends it on top-level GET navigations, so GET handlers must stay side-effect free.
2. **Logout by GET:** `/api/session/logout` accepts GET, so a cross-site link or image can sign the user out. This is a nuisance logout; it exposes no data.
3. **Another account launching in another tab is not detected.** An open tab keeps showing the previous user's cached data until it reloads.
   - **Consequence not in the D5 text, recorded here for the owner:** the stale tab's requests carry the new cookie, and owner ids are filled from the session (`me`). Saves from user A's stale tab are therefore written into user B's profile.
   - Binding existed to prevent exactly this case (AD-17's "Prevents" line).
   - The risk applies only to the same browser profile. The 15-minute idle and 8-hour absolute limits narrow it but don't remove it.

**Owner action:** confirm acceptance of point 3's write consequence. If it isn't acceptable, a narrow alternative is to compare the page's rendered `userId` with `/myself` before any save. That would be a separate decision; this proposal does not implement it.

### 4.4 Stories and PRD

No story text changes. The amended Epic 1 text is the source for every rework spec, and the PRD is unchanged.

## 5. Implementation handoff

- **Scope:** moderate. It needs backlog reorganisation and a reworked sequence, with the developer implementing.
- **Developer (this branch):** R1 → R2 → R3 → R4 → 1.11 → 1.12 → 1.13, each through `bmad-build`, committed in two commits (planning, then code), not pushed until reviewed.
- **Epic owner (Daniel Garcia):**
  - confirm D5 point 3;
  - answer the decisions below;
  - hold 7.0b until R4 and 1.11–1.13 land on this branch, or a PR into `main`.
- **Success criteria for each rework story:**
  - the amended story ACs pass;
  - every superseded symbol is gone, enforced by the forbidden gate;
  - the full checks are green (lint, typecheck, unit, e2e, build);
  - `CLAUDE.md` matches the code.

### Decisions before R1 (answered 2026-10-14)

- **Q1, R1 scope — answered (a):**
  - **(a) Recommended:** 1.1 + 1.2 together. Removing `APP_ENV`/`ONEHEALTH_SECRET_KEY` breaks `/launch` until `/api/token` exists, so splitting them needs a throwaway bridge.
  - **(b)** 1.1 alone, with a temporary two-key bridge inside the existing `/launch`, deleted in a later 1.2 rework.
- **Q2, forbidden-gate staging — answered yes:** Story 1.1's AC bans the superseded symbols (`APP_ENV`, `X-PP-Session`, `sessionBinding`, `window.top`, …) at once, but R2–R4 remove some of them. Proposed: each rework story adds the bans for the symbols it removes, so the gate is green at every step and complete after R4.

`publicFilesOrigin` is not an open decision: the amended Story 1.1 AC puts the key in the environment map with its values still open (unset means logos 404), so R1 adds it unset.
