---
title: 'F6-1 Page composition and shell extension points'
type: 'feature'
created: '2026-10-14'
status: 'in-progress'
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
- [ ] `features/shell/{page-tabs-config,page-tabs,profile-tabs,account-tabs,anchored-panel,placeholders,section-frame,contacts-panel,insurance-panel}.tsx` -- prop-driven tabs, presets, slots, placeholders, ready signal.
- [ ] `features/{personal,contacts,addresses,insurance,account,mfa,provider,organizations}/` -- stub entry points; `app/page.tsx` composes the `/` ones.
- [ ] `nav-types.ts`, `navigate.ts`, `handoff.ts`, `bff-contract.ts` -- `TAB_PARAM`/`tabParam`, `pageTabTarget`, `CANCELLED_CODE`, `isCancelled`, hand-off helper and guard.
- [ ] `use-section-form.ts`, `state-frame.tsx`, `page-frame.tsx`, `anchors.ts`, `section-{landmark,header}.tsx`, `save-order.ts`, `proxy.ts` -- items 3–9.
- [ ] Tests: unit (composition, tabs, handoff, navigate, reveal/CANCELLED, skeletons, proxy), `app/home.test.tsx`, e2e (`shell.spec.ts`, `headers.spec.ts`); `docs/FOUNDATION.md`.

**Acceptance Criteria:**
- Given the composed `/`, when it renders, then it looks and behaves as before (five Section landmarks, `#signature`, Section menu, deep links) and every e2e stays green.
- Given `lint`, `typecheck`, `vitest run --coverage`, `PP_E2E_PORT=3200 test:e2e`, `build`, `check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, thresholds met
- `PP_E2E_PORT=3200 corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

## Spec Change Log

## Review Triage Log
