---
title: 'F6-1 Page composition and shell extension points'
type: 'feature'
created: '2026-10-14'
status: 'in-review'
baseline_commit: '8547231'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/shared-foundation-plan.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A cross-team audit found that Team A (`/`, Epics 1–6) and Team B (`/account`, Epics 7–10) cannot plug their Sections into the pages without both rewriting the same shell files: `ProfileTabs` hard-codes its panels, `ContactsPanel`/`InsurancePanel` render fixed placeholders, the Section-ready signal is local plumbing (`nav.frameReady(id)`), and several story prerequisites (repeated `?tab=`, page no-store, hand-off helper, `SAVE_ORDER`, `CANCELLED`, collapsed-row focus, `/account` skeleton sizes, a `provider` landmark id) are missing from the shell.

**Approach:** Make composition slot-based and prop-driven. After this spec a feature story only creates files under `features/<its folder>/` and, at most, wires one element in `app/page.tsx` or `app/account/page.tsx`; it never edits shell files. Approved by the human in advance (2026-10-14): write the spec, then implement directly.

**Human direction (2026-10-14):** transversal components such as `PageTabs` are configured by props/params, never hard-coded per page. `PageTabs` receives the tab definitions (id, label, coming-soon tag, gutters, tab-order option), the panels, `defaultTab`, the URL param name (default `tab`) and an accessible name, and knows nothing about "profile" or "account". `ProfileTabs`/`AccountTabs` are thin presets that only build that config with placeholder defaults; the per-page tab lists live in a config module. The same principle applies to `ContactsPanel` (Sections by props) and any similar shell piece touched. Composition stays in `app/**`. Human decision: Phone, Email and Social share one folder, `features/contacts` (the Contact Point engine lives there).

## Boundaries & Constraints

**Always:**
1. **Slots (blocker):** `PageTabs({ page, tabs, panels, defaultTab, param?, "aria-label"? })` with React-element panels (server-component friendly); `ProfileTabs({ contacts?, insurance?, medical? })` and `AccountTabs({ personal?, provider?, organizations? })` presets with placeholder defaults; `ContactsPanel({ sections?: Partial<Record<ProfileSectionId, ReactNode>> })`, `InsurancePanel({ section? })` with placeholder fallback; `/account` Personal Account body `AccountPersonalPanel({ account?, authenticator? })` on a generic `AnchoredPanel`. The Section-ready signal is a context: `useSectionFrame(id)` → `{ onReady }`, provided by `ContactsPanel` (Section menu deep links) and `AnchoredPanel` (`useHashAnchors`). Feature entry stubs `features/{personal,contacts,addresses,insurance}/index.ts` composed in `app/page.tsx` (page unchanged), and `features/{account,mfa,provider,organizations}/index.ts` ready for `app/account/page.tsx` (not created: Story 7.1 owns it).
2. Repeated `?tab=` (`?tab=a&tab=b`), like a missing or unknown one, opens the default tab and is normalized to one value with a replace (Story 7.1 AC), on both pages.
3. `PageFrame` page-level `myself` load error must not duplicate the Section-level errors of Stories 2.1, 7.4 and 8.1: decide and document.
4. `useSectionForm`: `startEdit({ focus? })`; a reveal hook so a Section can expand a collapsed row before the first invalid field is focused (4.2); a `CANCELLED` save outcome (`{ ok:false, error:{ code:"CANCELLED" } }`) with no error UI, no focus move and no failure telemetry (2.4).
5. `StateFrame`: `tiles` five 112 px squares in one row from 768 px, 3-column grid below (8.1, UX-DR-P31); `cards` min height 248 px (UX-DR-P20, 10.1); `bars` width option up to 720 px (`control-max-wide`, 9.1).
6. `features/shell/handoff.ts#handoffHref({ to, tenantId })` (tenant `^\d{1,19}$`), `BFF_PATHS.handoffPortal = "/handoff/portal"`; `navigate({ external: "handoff" })` follows only hrefs on that path. The route stays in 7.3.
7. Root `proxy.ts` applies the exact `NO_STORE_HEADERS` (`Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie`; AD-18, Story 7.2) to `/`, `/account`, `/handoff/**` responses including redirects; unit and e2e assert.
8. `features/shell/save-order.ts` `SAVE_ORDER` (personal → email → phone → social → addresses, AD-8/1.14), exported from the shell index; the index exports every new piece.
9. `AccountSectionId` (`account | authenticator | provider`) widens the `SectionLandmark`/`SectionHeader` id type; `provider` is not added to `ACCOUNT_ANCHORS`.
- Semantic tokens only; copy only from `lib/shared/messages` (no new copy needed); 100% coverage on `lib/**`; Testing Library real events; axe where UI changes.

**Never:**
- Edit `components/ui/*` (F6-2), `lib/api/*` beyond strictly needed types, `e2e/fixtures.ts` or `messages/common.ts` (F6-3). No `app/account/page.tsx`, no `app/handoff/**` route.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Repeated tab | `/?tab=insurance&tab=medical#email` | Contacts selected, URL `/?tab=contacts#email` by replace | same on `/account` → `?tab=personal` |
| Composed Section | `ContactsPanel sections={{ phone: <X/> }}` | X in the phone slot, placeholders elsewhere, menu order kept | missing slot → placeholder |
| Deep link + ready | `/#phone`, composed Section's frame becomes ready | one instant re-scroll via `useSectionFrame("phone").onReady` | no provider → no-op |
| Hand-off | `navigate({ external:"handoff", href:"https://evil" })` | `false`, no guard, nothing assigned | bad tenant id → throws (dev/test), bare route (prod) |
| CANCELLED | `save()` → `{ ok:false, error:{ code:"CANCELLED" } }` | stays in edit, no banner, no toast, focus kept, no `section_save` | Save all counts it failed |
| Collapsed invalid row | Save with an error in an unmounted row | `revealField(path)` expands it, then focus first invalid in page order | not revealable → Section error |
| Page no-store | GET `/`, `/account`, `/handoff/portal` (any session state) | `NO_STORE_HEADERS` from `proxy.ts` | 307 to `/auth` carries them too |

</frozen-after-approval>

## Code Map

- `features/shell/page-tabs.tsx`, `nav-types.ts`, `navigate.ts` -- tab strip, typed targets, navigation.
- `features/shell/contacts-panel.tsx`, `insurance-panel.tsx`, `section-nav.tsx`, `use-hash-anchors.ts` -- panels and deep links.
- `features/shell/page-frame.tsx`, `state-frame.tsx`, `use-section-form.ts`, `section-landmark.tsx`, `section-header.tsx`, `anchors.ts`, `index.ts`.
- `lib/shared/bff-contract.ts`, root `proxy.ts`, `app/page.tsx`, `e2e/{shell,headers}.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `features/shell/{page-tabs-config,page-tabs,profile-tabs,account-tabs,anchored-panel,placeholders,section-frame,contacts-panel,insurance-panel}.tsx` -- prop-driven tabs, presets, slots, placeholders, ready signal.
- [x] `features/{personal,contacts,addresses,insurance,account,mfa,provider,organizations}/` -- stub entry points; `app/page.tsx` composes the `/` ones.
- [x] `nav-types.ts`, `navigate.ts`, `handoff.ts`, `bff-contract.ts` -- `TAB_PARAM`/`tabParam`, `pageTabTarget`, `CANCELLED_CODE`, `isCancelled`, hand-off helper and guard.
- [x] `use-section-form.ts`, `state-frame.tsx`, `page-frame.tsx`, `anchors.ts`, `section-{landmark,header}.tsx`, `save-order.ts`, `proxy.ts` -- items 3–9.
- [x] Tests: unit (composition, tabs, handoff, navigate, reveal/CANCELLED, skeletons, proxy), `app/home.test.tsx`, e2e (`shell.spec.ts`, `headers.spec.ts`); `docs/FOUNDATION.md`.

**Acceptance Criteria:**
- Given the composed `/`, when it renders, then it looks and behaves as before (five Section landmarks, `#signature`, Section menu, deep links) and every e2e stays green.
- Given `lint`, `typecheck`, `vitest run --coverage`, `PP_E2E_PORT=3200 test:e2e`, `build`, `check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, thresholds met
- `PP_E2E_PORT=3200 corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

Implemented 2026-10-14.

- **Prop-driven tabs** (human direction): `PageTabs<T>({ page, tabs: PageTabDefinition<T>[], panels: Record<T, ReactNode>, defaultTab, param = "tab", "aria-label"? })`. `PageTabDefinition` = `{ id, label, comingSoon?, bare?, skipInTabOrder? }` (replaces `renderPanel`/`panelOptions`/`isTab`/`toTarget`, which are gone). `isTab` is derived from `tabs`; the `navigate()` target comes from `pageTabTarget(page, tab, param)` (typed per page, `null` → no navigation), so `PageTabs` needs no function props and can be rendered from a server component. Page configs live in `features/shell/page-tabs-config.ts` (`PROFILE_TAB_DEFINITIONS`, `ACCOUNT_TAB_DEFINITIONS`). The param is configurable end to end: `TAB_PARAM` ("tab") in `nav-types.ts`, `NavTarget` page variants gained optional `tabParam`, and `navigate()` sets that param.
- **Presets and slots**: `ProfileTabs({ contacts?, insurance?, medical? })` (`profile-tabs.tsx`, plus `QuietPanel`), `AccountTabs({ personal?, provider?, organizations? })` (`account-tabs.tsx`). `ContactsPanel({ sections? })` renders the Section menu and each slot in `PROFILE_SECTIONS` order (Section menu, Jump to and scroll-spy still target the landmarks by id; `SectionNav` stays specific to the Contacts tab). `InsurancePanel({ section? })`. `AnchoredPanel({ anchors, focusHeading?, subAnchors?, className? })` is the generic deep-linked tab body; `AccountPersonalPanel({ account?, authenticator? })` is its `/account` preset (`ACCOUNT_ANCHORS`, h2 focus). Placeholders (`placeholders.tsx`): `ProfileSectionPlaceholder({ id })` (table skeleton with real columns; `personal` keeps the `#signature` row), `AccountSectionPlaceholder({ id: "account" | "authenticator" })` (kv / tiles), `AccountTabPlaceholder({ tab: "provider" | "organizations" })` (bars `wide` / cards, tab level). The old local `SignaturePlaceholder` moved there.
- **Ready signal**: `section-frame.tsx` `SectionFrameProvider({ onReady })` + `useSectionFrame(id)` → `{ onReady }` (stable; no-op outside a provider). `ContactsPanel` provides `nav.frameReady`, `AnchoredPanel` provides `useHashAnchors(...).frameReady`. Every placeholder uses it, so composed Sections and placeholders behave the same.
- **Feature stubs**: `features/personal` (`PersonalSection`), `features/contacts` (`PhoneSection`, `EmailSection`, `SocialSection`; one file each to avoid conflicts between 3.1/3.5/3.7), `features/addresses` (`AddressesSection`), `features/insurance` (`InsuranceSection`), `features/account` (`AccountSettingsSection`), `features/mfa` (`AuthenticatorSection`), `features/provider` (`ProviderTab`), `features/organizations` (`OrganizationsTab`). Each renders the shell placeholder; stories replace the body and keep the export. `app/page.tsx` composes the `/` ones and passes `saveOrder={SAVE_ORDER}`. `app/home.test.tsx` mirrors both compositions (the `/account` one is what Story 7.1 wires).
- **Repeated `?tab=`**: `getAll(param)`; anything but exactly one valid value shows the default and is normalized by replace (`params.set` collapses duplicates, other params and the hash kept). Applies to every `PageTabs`.
- **Decision (item 3)**: `PageFrame` gained `myselfLoadError?: "page" | "sections"` (default `"page"`). While every Section is a placeholder the page banner is the only place a failed `myself` shows, so removing it now would hide the error. The route switches to `"sections"` when the first Section that reads `myself` lands (2.1 on `/`, 7.4 on `/account`; 8.1 then also shows its own); one prop in `app/**`, no shell edit.
- **`useSectionForm`**: `startEdit(options?: { focus?: Path<T> })` (the Edit button calls it without options); option `revealField?: (path) => boolean`. Used before focusing a field with no mounted control (startEdit focus, mapped server field error, first invalid on own Save / Save all / leave guard): when anything is revealed, focus waits one render and then goes to the first invalid field in page order (second pass without reveal); errors nothing can reveal still show as the Section error. `CANCELLED_CODE = "CANCELLED"`, `isCancelled(result)` in `nav-types.ts`; `SaveErrorCode` = `TelemetryErrorCode | "CANCELLED"` (telemetry types unchanged). A cancelled save returns to edit with values kept, no banner, no toast, no focus move and no `section_save` event (a user's choice, not a failure); runners count it as not saved (`runSaveAll` puts it in `failed`, the leave guard stays).
- **Skeletons**: `tiles` = `grid grid-cols-3` of `aspect-square` tiles below 768 px, `md:flex` row of five `md:size-28` (112 px) tiles; `cards` `min-h-62` (248 px); `bars` `barWidth?: "control" | "wide"` (480 / 720 px) on `FrameSkeleton` and `StateFrame` (`BarWidth` type).
- **Hand-off**: `handoffHref({ to: "tenant", tenantId } | { to: "create-org" })`; tenant id = safe positive integer or a 1–19 digit string that isn't all zeros (`TENANT_ID_PATTERN`, `isTenantId`); a bad id throws unless `isProductionBuild()`, else returns the bare `/handoff/portal`. `isHandoffHref` (exact path or `path?…`); `navigate()` returns `false` for any other hand-off href before the leave guard runs.
- **No-store**: `proxy.ts#isNoStorePath(pathname)` (normalized: `/`, `/account`, `/handoff`, `/handoff/**`) adds `NO_STORE_HEADERS` to the pass-through response (navigation, RSC, prefetch); the cleared-session 307 and the disabled rewrite already had them. **Finding:** Next 16 keeps our `Cache-Control` and `Pragma` on a rendered page (verified: signed-in `/` → `private, no-store, max-age=0`, `no-cache`), but **replaces `Vary`** with its RSC list (also when set through `next.config` `headers()`, tried and reverted), and a 404 (today `/account` and `/handoff/portal`) gets Next's own `private, no-cache, no-store, max-age=0, must-revalidate`. `Vary: Cookie` is therefore asserted in `proxy.test.ts` only; the e2e asserts the exact set on rendered `/` and "never cached" (either value + `Pragma`) for the rest. With `private, no-store` no shared cache stores the page, so the missing `Vary: Cookie` has no effect; Story 7.2 re-checks once `/account` exists.
- **Other**: `AccountSectionId` (`AccountAnchor | "provider"`) on `SectionLandmark`/`SectionHeader`; `SAVE_ORDER` in `save-order.ts`; `BFF_PATHS.handoffPortal`; the shell index exports every new piece (`PageTabs`, configs, presets, panels, placeholders, `SectionFrameProvider`, `useSectionFrame`, `SAVE_ORDER`, hand-off helpers, `CANCELLED_CODE`, `isCancelled`, `TAB_PARAM`, `pageTabTarget`, `AccountSectionId`, `StartEditOptions`, `BarWidth`). `docs/FOUNDATION.md` updated (F6-1 row, Page composition row, Tabs, Navigation, Page frame, Section form, Read states, Section navigation, root interceptor, story map 1.14/2.4/4.2/7.1–7.3, recipe 4.2).
- **Tests added**: `features/shell/page-composition.test.tsx` (generic tabs with custom param and name, repeated/unknown `?tab=` on both pages, presets and slots, `/account` tabs and placeholders, ready signal for Contacts and `/account`, `myselfLoadError`, axe), `use-section-form-reveal.test.tsx` (CANCELLED own/registered, `startEdit({ focus })`, reveal on Save / validate / server field error, mixed revealable + not), `handoff.test.ts`, `navigate.test.ts` (hand-off guard, `tabParam`, `pageTabTarget`), `state-frame.test.tsx` (tiles, cards, wide bars), `proxy.test.ts` (no-store matrix), `app/home.test.tsx` (stubs composition for `/` and `/account`, axe), `e2e/shell.spec.ts` (repeated `?tab=`), `e2e/headers.spec.ts` (no-store).
- **Verification (2026-10-14)**: `corepack pnpm install` OK; `lint` and `typecheck` clean; `vitest run --coverage` 118 files / 2580 tests green, thresholds met; `PP_E2E_PORT=3200 test:e2e` 221 passed, 1 skipped (the existing desktop-only placement test on 360 px); `build` OK; `check-forbidden.sh` OK (tokens OK).
- **Deferred**: `Vary: Cookie` on rendered pages (Next owns it; Story 7.2 decides whether a deployment-level header is needed). `SectionNav` stays bound to `PROFILE_SECTIONS` (it is the Contacts tab's own navigation; making it generic was out of scope).

- **Review fixes** (2026-10-14, "fix: F6-1 review findings"; they supersede the notes above where they differ):
  - **`myself` error (H1):** the `myselfLoadError` prop is gone (no route edit). `PageFrame` mounts `MyselfErrorClaimProvider`; a Section that renders its own `myself` load error calls `useClaimMyselfError(Boolean(error))`, and the page banner hides only while a mounted Section holds a claim, so another tab (e.g. My Organizations) still shows it.
  - **`CANCELLED` in runners (H2):** `runSaveAll` outcomes (`done`, `session`) carry `cancelled` (via `isCancelled`), never counted in `failed` nor in `save_all` `failed`. `saveAllSummary` shows no "failed" copy for cancels: "{Section} saved." for one saved, new DRAFT COPY `SECTION_MESSAGES.savedCount` "{saved} saved." for several with a cancel, `null` when nothing was saved. The leave guard keeps its dialog open quietly on a cancel (no toast, focus left as is, not busy; the leave stays pending until Keep editing, Discard or Save).
  - **`confirmBeforeSave` (M1):** `useSectionForm` option `confirmBeforeSave?: (values) => Promise<boolean>`, awaited after validation, before `send()`'s saving state, on the own Save and the registered save; `false` or a rejection is `CANCELLED`. A second Save while it is pending joins it.
  - **Landmarks (M2):** `useLandmarkCheck(ids, where)` in `ContactsPanel` and `AnchoredPanel` logs a `console.error` outside production when an expected `<section id>` is missing after mount. The rule (render `SectionLandmark id` on the first render, never remount it) is in `docs/FOUNDATION.md` and every feature stub index. A frame ready makes the Contacts scroll-spy re-observe a landmark whose element changed (`observeLandmarks`; the hash lookup already resolves at ready time).
  - **Tabs (M3, L3, L4):** `PageTabs` validates its config outside production (`assertPageTabsConfig`: unique ids, `defaultTab` present, every id routable on the page; throws) and routes clicks by the configured ids. The tab query param is page config, `PAGE_TAB_PARAM[page]` (`tab` on both pages), used by `navigate()` (so `PageNav` and `ReturnLink` follow it) and `PageTabs`; the per-call `tabParam` and the `param` prop are gone. The presets name their tablists from new DRAFT COPY `SHELL_MESSAGES.profileTabsLabel` "Profile sections" and `accountTabsLabel` "Account sections" (EXPERIENCE.md names none), via `PAGE_TAB_LIST_LABELS`.
  - **Save all slot (M4):** stub `features/save-all` `SaveAllBar` (renders `null`) wired now as `PageFrame saveAllSlot` in `app/page.tsx`, one prop per line; Story 1.14 only replaces the stub body.
  - **Types (M6):** `useSectionFrame(id: SectionFrameId)` (`ProfileSectionId | "insurance" | AccountSectionId`).
  - **Reveal (L1):** the second pass, when the reveal mounted nothing to focus, shows the Section error and focuses it.
  - **Tests:** `page-composition.test.tsx` (claim on two tabs, bad tab configs throw and are skipped in production, tablist names, landmark check, re-observe), `confirm-before-save.test.tsx` (own Save pending/declined/confirmed/rejected, invalid form never asks, leave-guard path declined and confirmed), `save-all.test.ts` (cancelled bucket, telemetry, summaries), `use-section-form-reveal.test.tsx` (L1), `navigate.test.ts` (`PAGE_TAB_PARAM`).
  - **Verification (2026-10-14):** `lint`, `typecheck` clean; `vitest run --coverage` 119 files / 2602 tests green, thresholds met; `PP_E2E_PORT=3200 test:e2e` 221 passed, 1 skipped; `build` OK; `check-forbidden.sh` OK.

## Spec Change Log

- 2026-10-14 (review): item 3's decision changed from a static `PageFrame myselfLoadError` prop to the automatic claim (`useClaimMyselfError`); the configurable tab param moved from a `PageTabs` prop / `NavTarget.tabParam` to page config (`PAGE_TAB_PARAM`). Frozen intent unchanged.

## Review Triage Log

Review of `ed9eaca` vs `8547231` (coordinator-relayed findings).

- **Patched ("fix: F6-1 review findings"):** H1 automatic `myself` error claim; H2 `cancelled` bucket in `runSaveAll`, summary and leave guard; M1 `confirmBeforeSave`; M2 dev landmark check + documented landmark rule + scroll-spy re-observe on ready; M3 `PageTabs` config validation, clicks by configured ids; M4 `features/save-all` stub wired as `saveAllSlot`; M6 typed `useSectionFrame` id; L1 second-pass Section error + focus; L3 `PAGE_TAB_PARAM`; L4 tablist names (DRAFT COPY in `messages/shell.ts`).
- **Rejected:** L2 (stricter client-side hand-off href validation): the route (Story 7.3) re-validates every input and answers only 303s to the resolved portal, so the client check stays a path prefix.
- **Deferred:** e2e no-store assertion for RSC and prefetch requests → Story 7.2 (Team B, `deferred-work.md`); the unit matrix in `proxy.test.ts` already covers them.
- **Covered elsewhere:** M5 (client `lib/api` loader stubs) is spec F6-3's scope.
