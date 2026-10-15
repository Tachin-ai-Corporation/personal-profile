---
title: 'Story 1.9: Profile header picture (loader + avatar image with initials fallback)'
type: 'feature'
created: '2026-10-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '8935c234c3d726f6e9b0fb7562181db17e9c86b7'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** the shared profile header shows only initials. Story 1.9 (NG-9021) needs the user's Profile Picture in the 40 px avatar on `/` and `/account`. The foundation already built the server side: the `/api/pp/profile-picture-id` named op, the `profile-picture/preview` `asImage` entry, `profilePicturePreviewPath` and `FallbackImage`. Only the client loader and the avatar image are missing.

**Approach:**
- Register the `profile-picture-id` SWR loader in Team A's `lib/api/profile-picture.ts`.
- Render the avatar through `FallbackImage`, using the preview path with the file id as the cache-buster and the existing initials avatar as the fallback.
- The header refreshes when `keys.profilePictureId()` is mutated, which Story 1.10 relies on.

## Boundaries & Constraints

**Always:**
- Reuse the foundation pieces named in the Code Map. Edit only Team A paths (FOUNDATION T1).
- The header never shows an error for the picture: any failure falls back to initials, or to the user icon when there is no name.
- The avatar keeps its 40 px circle and the page keeps exactly one `h1`. The image is decorative (`alt=""`) because the name is in the `h1`.
- Export names carry the area prefix (T6).
- Pass the existing tests on both pages unchanged; the foundation handlers already answer the picture id with `{ fileId: null }`.

**Never:**
- Edit foundation code: `features/shell`, `components/ui/*`, `e2e/fixtures/{core,index}.ts`, `test/**` except `test/page-handlers/profile.ts`, `lib/api/index.ts`, `keys.ts`, allowlists, `bff-contract.ts`.
- Add an allowlist entry or named op, or use `next/image`, a raw `fetch`, or a second SWR config.
- Make the avatar interactive; that is Story 1.10.
- Add copy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Picture | `{ fileId: 9001 }`, image loads | `<img alt="">` with `src` `/api/1h/v2/user/profile-picture/preview?v=9001`, a 40 px circle, `object-cover` | N/A |
| No picture | `{ fileId: null }` | initials (or the user icon); no image request | N/A |
| Id loading | request pending | initials while pending; no broken-image box | N/A |
| Image fails | preview answers 404/502 or non-image | initials replace the image; no error text | `FallbackImage` `onError` |
| Id fails | 502 / network / malformed body (`fileId` not a positive integer or null) | initials; loader rejects with `ApiResponseError` | SWR error ignored by the header |
| Picture changed | `mutate(keys.profilePictureId())` returns a new id | the new `src` loads with no page reload | N/A |

</frozen-after-approval>

## Code Map

- `lib/api/profile-picture.ts`: the Team A stub; add the loader. Copy the pattern of `lib/api/myself.ts:142-156` (fetch → shape check → `unwrap` → `registerFetcher`). Tests go in `profile-picture.test.ts`, following `type-keys.test.ts:79-98`.
- `lib/shared/bff-contract.ts:82` `ProfilePictureIdBody`; `lib/api/files.ts` `isFileId` accepts numeric strings, so check for a positive safe integer instead. Import both; don't edit either.
- `features/header/profile-header.tsx` (`Avatar`, `ProfileHeader`), `use-primary-contacts.ts` (sibling hook style). `profile-header.test.tsx` uses `TestProviders`, which installs no handlers, so add a picture-id handler there.
- `components/ui/fallback-image.tsx`: `FallbackImage` (`src=null` shows the fallback).
- Test defaults already exist (don't edit): `test/page-handlers/shell.ts`, e2e `mockShellDefaults`, `mockHeaderPicture` (`e2e/fixtures/header.ts`), `mockProfilePicturePreview`, `setTheme`; the scroll check pattern is `e2e/shell.spec.ts:26-30`.

## Tasks & Acceptance

**Execution:**
- [x] `lib/api/profile-picture.ts`: add `toProfilePictureId(raw)` → `ProfilePictureIdBody | null`, `fetchProfilePictureId()` (`callApi("profile-picture/fetchProfilePictureId", profilePictureIdPath())`, shape error like `fetchMyself`), `loadProfilePictureId()`, and `registerFetcher("profile-picture-id", loadProfilePictureId)`. This is the 1.9 loader that 1.10 mutates.
- [x] `lib/api/profile-picture.test.ts`: cover the mapping (number, null, 0, negative, float, string, missing, non-object), fetch success / error / shape error, and the root `swrFetcher(keys.profilePictureId())`. This keeps `lib/api` at 100% coverage.
- [x] `features/header/use-profile-picture.ts`: a new `useProfilePictureSrc()` → `profilePicturePreviewPath(data?.fileId)` (null while loading, on error, or without a picture).
- [x] `features/header/profile-header.tsx`: a `PictureAvatar` that renders `FallbackImage` with `src` from the hook, `alt=""`, `fallbackWhileLoading`, `fallback={<Avatar …/>}` and the img classes `size-10 shrink-0 rounded-full border border-border object-cover`. Keep the skeleton while `myself` loads.
- [x] `features/header/profile-header.test.tsx`: add a default picture-id handler. Cases: picture shown with the right `src`; no picture → initials and no preview request; image `error` → initials; id 502 → initials with no alert; `mutate(keys.profilePictureId())` → new `src`; axe light/dark with a picture.
- [x] `e2e/profile-header.spec.ts`: a new Team A spec (fail-fast `test`, `mockProfileDefaults`, `mockHeaderPicture`). Cases: the picture on `/` and on `/account`; a failing preview → initials; axe light/dark at desktop and `mobile-360`; no horizontal scroll at 360 px.

**Acceptance Criteria:**
- Given any page with the header, when it renders, then exactly one `profile-picture-id` request is made per page load, and it goes through `callApi`.
- Given the header tab order checks (`expectHeaderTabOrder`), when they run on `/` and `/account`, then they pass unchanged: the avatar adds no tab stop.
- Given the full check, when it runs, then lint, typecheck, Vitest with 100% coverage on `lib/api`, e2e, build and `check-forbidden` are green.

## Implementation Notes

- `useProfilePictureSrc()` is called in `ProfileHeader`, not inside `PictureAvatar`, so the id request starts alongside `myself` instead of after the skeleton clears.
- The e2e "no error" check filters for alerts with text (`getByRole("alert").filter({ hasText: /\S/ })`), because Next's route announcer is an empty `role="alert"`.
- No foundation file was edited. The picture-id defaults already existed in `test/page-handlers/shell.ts` and e2e `mockShellDefaults`, so `test/page-handlers/profile.ts` is unchanged.
- Review patches (pass 1): `bg-card` on the image, the hook's doc comment for a failed refresh, the module doc's tense, and a class assertion replacing the exact `className` match.
- Verified on Node 24.22: lint, typecheck, `check-forbidden`; Vitest 3457/3457 at 100% coverage; `pnpm build` then `CI=1 pnpm test:e2e` 349 passed, 3 skipped by design. Nothing deferred.

## Review Triage Log

Pass 1 (blind hunter, edge-case hunter, verification gap; the verification-gap layer found no gaps):

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | blind | Replacing a picture flashes the initials until the new image loads | low | Real: `FallbackImage` keys by `src` and `fallbackWhileLoading` shows the initials while the new id's image loads. It happens only right after a picture change (Story 1.10) and lasts for the load. Rejected: the fix needs state outside `FallbackImage` (foundation). Note for 1.10: preload the new image before `mutate`. |
| 2 | blind + edge | "Exactly one id request per page load" breaks on window focus or reconnect (SWR defaults) | low | Real: the root `SWRConfig` keeps `revalidateOnFocus`, as `myself` and the contact-point reads do. A refocus refetches, which also keeps the avatar current after a change in another tab. Rejected: consistent with every other header read; the only fix that keeps the behaviour is narrowing this spec's AC wording. |
| 3 | blind | The hook relies on the root fetcher with a type parameter, unlike the sibling hooks' explicit `fetchers` | low | It follows FOUNDATION §1 "How to extend" (read with `useSWR(keys.x())`; `fetchers` are frozen). Its type is the exported `ProfilePictureIdBody`, the same as the loader's return type. Rejected. |
| 4 | blind | Tracking artifacts: the sprint status lacks a dated note; the module doc still says "will own" | low | The sprint-status note is written at story completion (step 5). The doc wording is a direct correction → **patch**. |
| 5 | blind | Brittle and weak unit assertions: exact `className`, a 20 ms settle, an early request count | low | The exact `className` match is a direct correction → **patch** (assert the key classes). The 20 ms settle and the request count follow the file's existing pattern, run after `waitFor(requests() === 1)`, and e2e counts after network idle. Rejected. |
| 6 | blind | e2e gaps: fallback only on `/`, no e2e for id failure, `previews >= 1`, `networkidle` | low | Shared component, same code on both pages; id failures are covered by unit tests (502, network, malformed). `toBe(1)` risks flake for no demonstrated defect. Rejected. |
| 7 | blind | The loaded `<img>` lacks `bg-card`, so a transparent picture shows the header background | low | Real; direct correction → **patch** (add `bg-card`). |
| 8 | blind | Tests hardcode the preview URL instead of `profilePicturePreviewPath()` | false | The literal URL is the wire contract under test; building it with the function under test would make the assertion tautological. |
| 9 | edge | After a successful read, a failed refresh keeps the stale `fileId` (old picture stays) | low | Real (SWR keeps `data` on error). Showing the last known picture is the intended "never an error" behaviour; 1.10 can `mutate` with the new id. The hook's doc says "null on error", which is inaccurate → **patch** the comment. |
| 10 | edge | `myself` failed but the picture id succeeds → picture next to an sr-only h1 | low | Real but rare. Showing the user's own picture is not wrong, and the page banner reports the `myself` failure. Rejected. |
| 11 | edge | The gated MSW handler is not released if an assertion throws first | low | Test-only: the failing test already fails and Vitest times it out. Rejected. |
| 12 | edge | e2e `getByText("AL", { exact: true })` could match other page text | low | No exact "AL" text in the `/` or `/account` defaults. Rejected. |
| 13 | edge | Claim: hook "null on error" | low | Same root cause as #9 → patch the comment. |
| 14 | edge | Claim: one request per page load | low | Same root cause as #2. Rejected. |

## Design Notes

- **`fallbackWhileLoading`:** the initials stay visible until the image has loaded, so the avatar never flashes empty or shows a broken image. A failure simply keeps the initials.
- **Placement:** the loader lives in `lib/api`, so 1.10 can `mutate` the same key after an upload.

## Verification

**Commands** (run on Node 24, per `engines`: the shell's default Node 26 makes Vitest exit 1 on an MSW/undici socket error even when every test passes. Prefix with `export PATH=/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin:$PATH`. Never run e2e with `CI=1` without a fresh `pnpm build` first):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, 100% on `lib/server`, `lib/api` and `lib/shared`, exit 0 (Node 24)
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
