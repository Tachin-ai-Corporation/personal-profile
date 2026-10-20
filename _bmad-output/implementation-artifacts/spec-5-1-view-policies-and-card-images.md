---
title: 'Story 5.1: View policies and card images'
type: 'feature'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
baseline_commit: 'f415d43226dfc7b2a56f58109ba87fe33840d01d'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Insurance tab of `/` is still the F6-1 placeholder, so patients can't see the policies on file or their card photos (Story 5.1, FR28, FR31, NG-9029; acceptance source: `epics.md` "### Story 5.1: View policies and card images").

**Approach:** Fill `features/insurance` with a read-only Section: one SWR read of the policy list (a Spring Page), one bordered card per policy with a key/value grid and Front/Back card thumbnails served by a new `asImage` download entry, a card image viewer dialog, and the empty, loading, error and Deleted states. The Section registers as guard-only now, so the editor in Story 5.2 only plugs in.

## Boundaries & Constraints

**Always:**
- **Read:**
  - `GET v2/health/patient/insurance?page=0&size=100` (`insuranceListPath()`) under `keys.insurance()`, through a loader registered in `lib/api/insurance.ts`. Add the allowlist entry with the query fixed to those two parameters.
  - The loader reads a Spring Page (`content`) or a bare list.
  - A 403 is the Section's no-access state (`forbiddenScopeFor` already maps it). A failure without data shows "Couldn't load insurance · Retry", and Retry revalidates only `keys.insurance()`.
- **Mapping** (`ResponseInsuranceDTO`; enums arrive as constant names, `N_A` included):
  - **Status:** `label === "Deleted"` means Deleted. Active cards come first, then Deleted ones; otherwise keep the platform order.
  - **Count:** the header count is the number of non-Deleted policies.
  - **Title:** "{Type} Insurance". The type is shown in title case (`MEDICAL` → "Medical"); `N_A` or missing gives just "Insurance".
  - **Chip:** Primary uses the filled `primary` chip. Secondary, Supplemental and Other use the `label` chip. `N_A` gets no chip. A Deleted card gets the `deleted` chip instead.
  - **Grid:** `KeyValueTable`, two pairs per row, in this order: Insurer (`insuranceOrganizationDTO.insuranceCompanyName`), Subscriber, Member ID, Effective, Group ID, Expiration, Cancellation.
  - **Dates:** `MM/DD/YYYY` (`wireToDisplayDate`). An empty value, `"n/a"`, or the backend's `1970-01-01` sentinel date reads "Not provided". The sentinel check stays local to insurance.
  - **Subscriber:** the subscriber's first + last name. When the relationship is `SELF`, the user's own name from `useMyself()`.
- **Card:**
  - Flat, bordered, `rounded-md`, no shadow. One column at every width, 16 px apart.
  - The title row is at least 52 px, with a bottom hairline.
  - The kebab, once it has items, is named "More actions for {Insurer} {Type} Insurance". In 5.1 it has none, so `RowActions` renders nothing (decision 1A).
  - A Deleted card has all text muted, no kebab and no thumbnail action.
- **Thumbnails:**
  - 120×76 `rounded-sm` behind a left hairline (below the grid under 768 px), captioned "Front" / "Back".
  - `src` is `/api/1h/v2/health/insurance/{id}/file/{fileId}/download?fileRelKey=InsuranceHas{Front|Back}SideCardFile`, built in `lib/api/insurance.ts`. The `fileId` comes only from `frontSideCardFile.id` / `backSideCardFile.id`.
  - A missing side, or an image that fails to load (`FallbackImage`), shows a dashed tile reading "Image not uploaded" with the same accessible name.
  - An active card's thumbnail is a button (click, Enter, Space) that opens the viewer on its side.
- **Download entry:** `{ method: "GET", template: "v2/health/insurance/{insuranceId}/file/{fileId}/download", asImage: true, query: { fileRelKey: one of the two relations } }`. `preview=true` is forced by `asImage`. Its tests copy the files-area image-entry tests: the entry shape and the forced preview, plus headers through the handler (inline only for sniffed PNG/JPEG/BMP, otherwise attachment, `nosniff`, `private, no-store, max-age=0`, no Set-Cookie).
- **Viewer:**
  - A `Dialog` with `size="lg"`, `fullScreenOnMobile`, `rounded-lg`, a title naming the policy (DRAFT), and the image fit to the viewport on a card surface.
  - A Front/Back toggle built in `features/insurance` from two buttons with `aria-pressed`. A missing side is disabled.
  - Close. Escape or Close returns focus to the thumbnail that opened it (`useModalHandlers` does this).
- **States:**
  - **Loading:** skeleton policy cards, static under reduced motion, through `StateFrame`. A local card skeleton is fine if no `skeleton` value fits.
  - **Empty:** `EmptyState variant="card"` reading "No insurance on file. Add a policy before your next visit.", with no action until Story 5.2 (decision 1A).
  - **Frame:** `SectionLandmark id="insurance"` from the first render; `useSectionFrame("insurance").onReady`; no Section index or Jump to.
- **Guard-only registration:** `useRegisterSection({ id: "insurance", label, displayOrder: 6, saveAll: false, isDirty: false, discard: () => {} })`. No `draftFields`, no `save`. Story 5.2 supplies the rest.
- **Copy:** grep the catalog first (`COMMON_MESSAGES.notProvided`, `close`). New strings go in `lib/shared/messages/insurance.ts`, verbatim from EXPERIENCE or marked `// DRAFT COPY`.
- **Test defaults:** keep `test/page-handlers/profile.ts` answering `[]`, because a foundation test pins it (the Epic 4 precedent). Change `mockInsurance`'s default to an empty Page. The unit tests and e2e tests pass the real Page shape themselves.
- **Quality:** axe in light and dark, 44 px targets, 360 px with no horizontal scroll, semantic tokens only.

**Decisions (human, 2026-10-20):**
- **1A, no dead entry points:** "Add insurance" (header and empty card) and the card kebab stay hidden until Stories 5.2 and 5.5 add what they open. `RowActions` with no items renders nothing.
- **Epic 5 ships to `main` as one PR**, as Epic 4 did, so users never see the gap. Rebase onto `main` (and Epic 4, once PR #26 merges) before that PR.
- **Full spec kept** (about 2,400 tokens).
- **Backend placeholder values** (`1970-01-01` for a missing date, `"n/a"` for a missing Group ID) read as "Not provided". They are logged in `deferred-work.md` to confirm on demo.

**Never:**
- Edit `features/shell/**`, `components/ui/*` (existing files), `lib/api/{index,keys,type-keys}.ts`, `allowlist/index.ts` or `test/**` (except `test/page-handlers/profile.ts`) without asking first. Each such change gets its own commit.
- Import another feature, or fetch an image without the session cookie (same-origin `<img>` only).
- Push. Commit locally only, after the checks and the review.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cards | Page with Primary MEDICAL (Self, both cards) + Secondary DENTAL (spouse, no cards) + Deleted VISION | order Medical, Dental, Vision; count 2; chips Primary / Secondary / Deleted; "Avery Lee" (own name) and "Sam Lee"; Dental shows two "Image not uploaded" tiles | N/A |
| Sentinels | expiration `1970-01-01`, group `"n/a"`, no cancellation | Expiration, Group ID, Cancellation read "Not provided" | N/A |
| Deleted | label "Deleted" with a front card | muted text, Deleted chip, no kebab, thumbnail not a button | N/A |
| Viewer | Enter on Front | Dialog on Front; Back toggle (disabled if missing); Escape → focus back on that thumbnail | N/A |
| Broken image | download answers 404 / non-image | dashed "Image not uploaded" tile | silent |
| Empty | `{content: []}` | dashed empty card with the copy | N/A |
| Error | list 500 | "Couldn't load insurance · Retry"; Retry reloads only this key | banner |
| Forbidden | list 403 | Section no-access state | N/A |
| Download entry | `fileRelKey=Other`, extra query, non-numeric id | refused before upstream (400 / 403) | proxy error |

</frozen-after-approval>

## Code Map

- `features/insurance/insurance-section.tsx`:
  - Replace the stub. Keep the `InsuranceSection` export and the `index.ts` barrel.
  - Split as needed (`policy-card.tsx`, `card-viewer.tsx`, `format.ts` for mapping/sentinels). Pure mapping lives in `format.ts`, with tests.
- `lib/api/insurance.ts` (+ new `insurance.test.ts` cases, 100 %):
  - an `InsurancePolicy` type, `toInsurancePolicies(raw)` (Page or list; zod), `fetchInsurance`/`loadInsurance`, `registerFetcher("insurance", …)`;
  - `insuranceCardDownloadPath(id, fileId, side)` (positive-integer ids, else `null`).
  - Model: `lib/api/addresses.ts` (Epic 4 PR) and `contacts.ts` on main.
- `lib/server/proxy/allowlist/insurance.ts` (+ test): the list entry (`page` `^0$`, `size` `^100$`, as `allowlist/addresses.ts`' `PAGE`/`SIZE` patterns) and the download entry.
  - Header tests: `lib/server/proxy/handler.test.ts:507` `describe("proxy: image downloads (AD-13 hardening)")` and `allowlist/files.test.ts` "profile picture preview". Copy them into the insurance test; don't edit them.
- `lib/shared/messages/insurance.ts`: `INSURANCE_MESSAGES` is `{}` today. Add the section copy ("Insurance" title through `SHELL_MESSAGES` if present), the type names, "Front", "Back", "Image not uploaded", "Deleted", the empty copy, "Add insurance" (for 5.2), and the viewer title.
- `lib/api/errors/insurance.ts`: no rules needed for a read. Leave it as is unless a test needs it.
- **Foundation pieces:**
  - from `features/shell`: `StateFrame`, `SectionLandmark`, `SectionHeader` (`count`, `actions`), `KeyValueTable` (`rows`, `labelledBy`), `RowActions`, `useRegisterSection`, `useSectionFrame`, `sectionHeadingId`, `useMyself`;
  - from `components/ui`: `Chip`, `EmptyState`, `FallbackImage`, `Dialog`/`DialogContent` (`size`, `fullScreenOnMobile`), `useModalHandlers`;
  - from `lib/shared`: `dates.ts` `wireToDisplayDate`, `isNotProvided`.
- **Fixtures:** `e2e/fixtures/insurance.ts` gains `insurancePolicy(overrides)`, an `insurancePage(rows)` builder, and `mockInsuranceCard(page, …)` (copy `mockFileDownload`, `e2e/fixtures/core.ts:203`). `mockInsurance` defaults to an empty Page.
- **Tests:**
  - unit: `features/insurance/insurance-section.test.tsx` (MSW, `renderInPage`), modelled on `features/addresses/addresses-section.test.tsx` (Epic 4 PR) or `features/contacts/phone-section.test.tsx` (main);
  - e2e: a new `e2e/profile-insurance.spec.ts`.
- **Check:** `app/page.test.tsx` and `e2e/shell.spec.ts` for placeholder assumptions on the Insurance tab.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/proxy/allowlist/insurance.ts` (+ test) -- list and card-download entries -- the read and the images.
- [x] `lib/api/insurance.ts` (+ test, 100 %), `lib/shared/messages/insurance.ts` -- loader, mapping types, download path, copy.
- [x] `features/insurance/*` (+ unit tests, every I/O row, axe light and dark) -- the Section, card, viewer and states.
- [x] `e2e/fixtures/insurance.ts`, `e2e/profile-insurance.spec.ts` -- the fixtures and the 5.1 journey on desktop and at 360 px.
- [x] `deferred-work.md`: the backend placeholder values to confirm on demo (logged by the orchestrator at approval).
- [x] `sprint-status.yaml`: the `5-1` line only, set to `review` when done.
- [ ] After review (orchestrator): commit locally (no push), then update the local-view worktree and `dev-mock.ts` with sample policies and card images, and typecheck there.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100 % coverage on `lib/server`, `lib/api` and `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed, or each other path was approved by the user and is in its own commit.

## Implementation Notes

- **Landmark:** `SectionLandmark` takes no `count`, so the Section renders `<section id="insurance" aria-labelledby="insurance-heading">` + `SectionHeader count` itself (the Phone/Personal pattern), from the first render, never remounted.
- **Copy:** the title is `SHELL_MESSAGES.profileTabInsurance`, the "Back" caption `COMMON_MESSAGES.back`, the Primary chip `COMMON_MESSAGES.primary` (catalog uniqueness). Type and precedence names are the enum constants in title case (`insuranceEnumLabel`), not catalog strings: "Medical" already exists as `SHELL_MESSAGES.profileTabMedical`. New strings: `INSURANCE_MESSAGES` (verbatim: "Subscriber", "Image not uploaded", the empty copy, "Add insurance"; the rest `// DRAFT COPY`).
- **Accessible names (DRAFT):** a card image is "{Side} of {Insurer} {Type} Insurance card" (the thumbnail button's name); the dashed tile is `role="img"` "{Side} image not uploaded" with the visible "Image not uploaded", the same name for a missing side and a failed image. A failed thumbnail becomes the plain tile (no button) and its viewer toggle is disabled.
- **Skeleton:** `StateFrame skeleton="cards"`, narrowed to one column of two cards with `[&_[data-slot=frame-skeleton]]:grid-cols-1` / `nth-child(n+3):hidden` on the frame (no local skeleton). Loading and ready drop the frame's container; error and no-access keep it.
- **Allowlist:** the list query is exactly `page=0&size=100` (both `required`); the download's `fileRelKey` is `required` (the backend makes it optional, the client always sends it).
- **Mapping:** `lib/api/insurance.ts` keeps platform values (`InsurancePolicy`, enums as constant names, wire dates); every display rule, the `1970-01-01` sentinel (`insuranceWireDate`, for the 5.2 editor too) and `N_A` live in `features/insurance/format.ts`. A Self subscriber shows the platform's subscriber name until `myself` loads.
- **Deleted card:** muted with `[&_*]:text-muted-foreground!` on the card (axe clean in light and dark, e2e).
- **Viewer:** the card returns focus to the opening thumbnail itself (`onCloseAutoFocus`), so a click in Safari (no focus on click) returns there too.
- **Verification (Node 24.22.0):** lint, typecheck, check-forbidden clean; `vitest run --coverage` 5,851 tests, 100 % on lib/server, lib/api, lib/shared; `pnpm build` then `CI=1 pnpm test:e2e` 959 passed / 11 skipped (pre-existing), no failures; new `e2e/profile-insurance.spec.ts` 16 passes (desktop + 360 px).

- **Review pass 1 patches** (triage rows 1–10): image failures keyed by the failed `src` (a new file id shows again); `insuranceWireDate` returns `null` for anything that isn't `YYYY-MM-DD`; the `1970-01-01` sentinel applies to Expiration and Cancellation only; upload entries built from `CARD_RELATIONS`; verbatim copy tagged; the e2e Retry check tightened; the stale sprint-status phrase dropped; three tests added.
- **Final verification (orchestrator, Node 24.22):** lint, typecheck and `check-forbidden` are clean. Vitest: 5858/5858 passed (208 files), 100 % on `lib/server`, `lib/api` and `lib/shared`. `pnpm build` passed. `CI=1 pnpm test:e2e`: 959 passed, 11 skipped, none flaky.

## Spec Change Log

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG); O is the orchestrator's own read.

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | VG | Untested: a repeated list failure is announced again (`attempt`) | low | Gap as filed; Email, Social and Personal pin it → **patch**: a test. |
| 2 | VG | Untested: a failed background revalidation keeps the cached cards | low | Gap as filed (focus revalidation is on) → **patch**: a test. |
| 3 | VG | Untested: a failed thumbnail disables its side in the viewer | low | Gap as filed → **patch**: extend the failed-thumbnail test. |
| 4 | E, B | A side's failure is keyed by side, not by file, so a new file id (revalidation, Story 5.3) never shows until the card remounts | medium | Real (`failed[side]` forces `null` regardless of `src`), and 5.3 depends on it → **patch**: key the failure by its `src`. |
| 5 | B | `insuranceWireDate`'s doc says it returns `YYYY-MM-DD` but passes any other string through | low | Real doc mismatch, and 5.2 is told to load dates through it → **patch**: return `null` for anything that isn't a `YYYY-MM-DD` date, and test it. |
| 6 | B | The `1970-01-01` sentinel is also applied to the Effective date, though the backend only defaults Expiration and Cancellation | low | Real, and Effective is required in 5.2 → **patch**: apply the sentinel to Expiration and Cancellation only. |
| 7 | B | The card relation strings are repeated in `allowlist/insurance.ts` (the new `CARD_RELATIONS` beside literal `cardUpload("InsuranceHas…")` calls) | low | Real, in one file → **patch**: build the upload entries from `CARD_RELATIONS`. Sharing one constant across client and server would be a `lib/shared` (foundation) change → rejected. |
| 8 | B | Verbatim copy entries carry no source tag, unlike their neighbours | low | Real (convention: `// verbatim: EXPERIENCE.md …`) → **patch**: tag them. `addInsurance` stays for Story 5.2. |
| 9 | B | The e2e "Retry reloads only the list" ignores every `/health/` path | low | Real looseness → **patch**: exclude only the list path and the card downloads. |
| 10 | B | The 5-1 sprint-status note ends "Local, uncommitted; ready for review", which goes stale | low | Real → **patch**: drop that phrase. |
| 11 | O | The viewer's missing-side toggle is only `aria-disabled` and might still switch sides | false | `components/ui/button.tsx:59-69`: an `aria-disabled` Button is inert (click, Enter, Space do nothing). |
| 12 | E, B | Focus falls to `body` if the opener thumbnail turns into a tile while the viewer is open | low | Needs an image that loaded as a thumbnail to fail later, with the viewer open; a fallback target adds branches → rejected. |
| 13 | E, B | An image that fails only inside the viewer leaves its toggle enabled | low | Rare (the thumbnail loaded), and the tile is shown; reporting it back would unmount the opener (row 12) → rejected. |
| 14 | E, B | One malformed row rejects the whole list | low | Same all-or-nothing parse as the Addresses and Contacts loaders; the backend DTO is typed → rejected. |
| 15 | E, B | More than 100 policies are cut off silently | low | Unrealistic for a patient → rejected. |
| 16 | E | Two policies with the same insurer and type share accessible names | low | Rare; the visible chip still tells them apart; changing names is new copy → rejected. |
| 17 | E | Duplicate ids would give duplicate React keys | false | Policy ids are database ids; the API never repeats one. |
| 18 | E-claim | `sprint-status.yaml` also changes the `epic-5` line | false | Intended: the orchestrator set `epic-5` to `in-progress` when the first story started (the workflow's sprint sync). |
| 19 | B | Type and precedence labels are title-cased enum names, not catalog or type-key literals | false | The spec says so ("shown in title case"), and the 5.2 editor shows the type-key options in title case too. |
| 20 | B | The viewer re-downloads the image (no-store) with no loading state | low | `no-store` is mandated (AD-2); a loading placeholder is new UI → rejected. |
| 21 | B | A Self subscriber's name switches once `myself` loads | low | `myself` is the page's first read and is normally there before the list; the spec rule is to show the user's name → rejected. |

## Design Notes

**Agent decisions:**
- **Sentinels:** `1970-01-01` and `"n/a"` read as "Not provided" (from the backend code). This is not yet confirmed on demo, so it gets a deferred-work entry.
- **`displayOrder: 6`:** after Addresses' 5 in the Epic 4 PR.
- **Viewer toggle:** built locally, because there is no shared segmented control.
- **`preview=true`:** forced as the AC asks, although the backend ignores it.

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; if `corepack` is missing, also put `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/af4a8bf2-5800-44b7-adc9-13891a6c3dc2/scratchpad/shim` first; the implementer makes no commits; never `pnpm dev` here; never `CI=1` e2e without a fresh build):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
