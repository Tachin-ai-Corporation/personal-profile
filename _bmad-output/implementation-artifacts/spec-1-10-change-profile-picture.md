---
title: 'Story 1.10: Change Profile Picture'
type: 'feature'
created: '2026-10-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1e3c1fab9b58282834794c799b0702f9d541eefc'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-header-profile-picture.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** the header avatar (Story 1.9) only displays the Profile Picture. Story 1.10 (NG-9021, FR10) lets the user replace it from the header on `/`, with a preview before saving.

**Approach:**
- On `/` only, the avatar becomes a button that opens the native file picker.
- A chosen file opens the "Change profile picture" dialog.
- Save always re-encodes the file in the browser to a JPEG of at most 4 MB (D-C), uploads it through the existing picture upload entry, deletes the old picture best-effort through `fileDeletePath`, and refreshes the avatar.

**The acceptance source** is the Story 1.10 ACs in `_bmad-output/planning-artifacts/epics.md` (section "### Story 1.10: Change Profile Picture"), with these overrides:
- **(a) Avatar button only on `/`:** the header decides with `useCurrentPage()` (decision 2026-10-14, FOUNDATION R11), not a `pictureEditable` prop. On `/account` the avatar stays a non-interactive image.
- **(b) No `?fileName=` query:** the upstream name is the multipart `file` part's filename (F2). The allowlist entry and the upload mechanism already exist; add no entry.
- **(c) Old picture delete:** `DELETE fileDeletePath(oldId)`, the ownership-checked named op (F7-2). `DELETE v2/file/**` is denied; add no entry.
- **(d) Re-encode helper:** a brand-new browser-only `components/ui/image-reencode.ts` (FOUNDATION §3.5), not `lib/shared`. It is the only re-encode code; 2.4 and 5.3 reuse it.
- **(e) Success toast:** `toastSuccess` from the shell toasts, not `hooks/use-toast`.
- **(f) Upload rejected:** a 413/415 maps through `isUploadRejected(mapApiError(…))` to `COMMON_MESSAGES.uploadRejected`.
- **(g) D-C (human, 2026-10-15):** every in-app upload is re-encoded. The original bytes are never sent, even for a small JPEG. EXIF/GPS on pictures uploaded outside the app is an accepted risk.

## Boundaries & Constraints

**Always:**
- **Reuse:**
  - from Story 1.9: `fetchProfilePictureId`, `keys.profilePictureId()`, `profilePicturePreviewPath`, `PictureAvatar`/`FallbackImage`;
  - `profilePictureUploadPath()`, `fileDeletePath`, `callApi`;
  - `Dialog` (`size` default 440 px, `dismissible={false}` while saving, `initialFocus` = Cancel, focus returns to the opener);
  - busy `Button busyLabel`, `FieldError`/`InlineBanner`, `toastSuccess`, `mapApiError`/`isUploadRejected`.
- **Edit only Team A paths:**
  - `features/header/**`, `lib/api/profile-picture.ts` (+ test), `lib/shared/messages/header.ts`;
  - `e2e/fixtures/header.ts` (add `"button:Change profile picture"` to `HEADER_TAB_STOPS.profile` only), `e2e/profile-*`;
  - plus the brand-new `components/ui/image-reencode.ts` (+ test).
- **Save flow:**
  1. Read the current id fresh with `fetchProfilePictureId()`.
  2. `POST` multipart with exactly one `file` part: the re-encoded JPEG named `<sanitized base>.jpg`.
  3. On success, `DELETE fileDeletePath(oldId)` when an old id existed. A delete failure is silent.
  4. Read the new id and preload its preview image (bounded wait).
  5. Set `keys.profilePictureId()` to the new id without a refetch flash, so no initials flash (1.9 review note).
  6. Close the dialog, call `toastSuccess("Profile picture saved.")` (DRAFT COPY) and focus the avatar.
- **Errors:**
  - A 413/415, or the re-encode result `TOO_LARGE`, shows the `uploadRejected` line.
  - A network failure or 5xx shows "Couldn't save your profile picture. Check your connection." (DRAFT) with Retry, which re-runs the upload with the same blob.
  - `SESSION_EXPIRED` closes the dialog with no error.
  - No delete is sent on any failure.
- **Copy:** all new strings go in `lib/shared/messages/header.ts`. Strings verbatim from the EXPERIENCE.md Voice and Tone table (rows "Change profile picture", "Picture too large") stay unmarked; everything else is `// DRAFT COPY`. Grep the catalog first (T5).
- **Accessibility:**
  - The button is 44×44 around the 40 px circle, accessible name "Change profile picture", with the `focus-ring` utility and the camera badge.
  - The picker `accept` is exactly as the AC states.
  - Cancelling the picker returns focus to the avatar.
  - axe passes in light and dark at desktop and 360 px, with no horizontal scroll.

**Never:**
- Edit foundation code: `features/shell`, existing `components/ui/*`, `lib/server/**`, allowlists, `lib/api/index.ts`, `e2e/fixtures/{core,index}.ts`, `test/**`, `package.json`.
- Add a dependency, such as a canvas package.
- Upload original bytes.
- Use `next/image`, raw `fetch` or `hooks/use-toast`.
- Make the avatar interactive on `/account`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid file | JPG/PNG/BMP ≤ 6 MB that decodes | the dialog with a 96 px preview, file name, "{TYPE} · {size}", Save enabled | N/A |
| Too large | > 6 MB | the preview keeps the current picture or initials, captioned "Current picture · Not changed"; the error line; Save aria-disabled and pointing at it; no request | inline error |
| Wrong type or undecodable | `.gif`/`.svg`/`.heic`/`.pdf`, or a `.png` that isn't an image | the "isn't a JPG, PNG or BMP" line; Save aria-disabled | inline error |
| Small JPEG with EXIF | 300 KB JPEG with an APP1 `Exif` segment | the uploaded body is a re-encoded JPEG (FF D8 FF) with no `Exif` marker and different bytes from the original | N/A |
| Large PNG or BMP | 5.9 MB PNG, 5.5 MB BMP | the uploaded JPEG is ≤ 4 MB | N/A |
| Replace | old id 9001 → new id 9002 | upload, then `DELETE /api/pp/file/9001`, then the avatar shows `?v=9002`, the toast, focus on the avatar | N/A |
| First picture | old id `null` | no DELETE | N/A |
| Delete fails | DELETE 404/502 | still a success; nothing shown | swallowed |
| Upload rejected | 413 / 415 | the dialog stays with the `uploadRejected` line; the avatar unchanged; no DELETE | inline |
| Network / 5xx | network error or 502 | "Couldn't save your profile picture. Check your connection." + Retry (same blob, no new re-encode) | inline + Retry |
| Session ended | `SESSION_EXPIRED` | the dialog closes; no error line or toast | session dialog |
| Cancel / Escape | before or after choosing | the dialog closes with no request; focus on the avatar | N/A |
| Saving | Save pressed | Save busy "Saving…"; Cancel and Choose another inert; Escape does nothing | N/A |
| `/account` | header on `/account` | no button and no tab stop (`HEADER_TAB_STOPS.account` stays empty) | N/A |

</frozen-after-approval>

## Code Map

- `features/header/profile-header.tsx`: `ProfileHeader`, `PictureAvatar`, `Avatar`. Wrap the avatar in a button only when `useCurrentPage() === "profile"`.
- `features/header/use-profile-picture.ts`: `useProfilePictureSrc()`.
- `lib/api/profile-picture.ts`: `fetchProfilePictureId`, `profilePictureUploadPath`, `profilePicturePreviewPath`. Add `uploadProfilePicture(blob, fileName)` (`callApi`, `FormData` body; `callApi` adds JSON headers only for string bodies) and `deleteProfilePictureFile(id)` via `fileDeletePath` (`lib/api/files.ts`). Use area-prefixed names (T6).
- `components/ui/dialog.tsx`: `DialogContent({ size, dismissible, initialFocus })`, `DialogHeader`/`DialogBody`/`DialogFooter`. Focus returns to the element focused at open.
- `components/ui/button.tsx`: `busy`, `busyLabel`. Also `components/ui/inline-banner.tsx` and `form-field.tsx` (`FieldError`).
- `features/shell/toasts.ts`: `toastSuccess`. `lib/api/errors`: `mapApiError`, `isUploadRejected`. `lib/shared/messages/common.ts`: `uploadRejected`, `cancel`, `save`, `retry`.
- `lib/server/proxy/allowlist/core.ts`: the picture upload entry (4 MB, PNG/JPEG/BMP, part `file`, `isPublic` forced). Read only.
- Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/mockups/key-profile-picture.html`.
- Tests:
  - `features/header/profile-header.test.tsx` (1.9 handlers and `mutate` probe);
  - `e2e/profile-header.spec.ts`;
  - `e2e/fixtures/header.ts` (`mockHeaderPicture`, `HEADER_TAB_STOPS`);
  - core `mockProxy`, `mockFileDownload`, the fail-fast `test`.

## Tasks & Acceptance

**Execution:**
- [x] `components/ui/image-reencode.ts` + `image-reencode.test.ts`:
  - `reencodeImage(file, { format, maxBytes, maxDims })` exactly per the AC: decode, fit without upscaling, then the quality steps 0.92/0.85/0.75/0.6 with ×0.8 scaling, a white background for JPEG, the 64 px floor, never throws.
  - Test the algorithm in jsdom with stubbed `createImageBitmap` and canvas `toBlob` covering: quality steps, scaling, the floor and `TOO_LARGE`, `UNDECODABLE`, no upscaling, the PNG path.
  - Real encoding is proven in e2e.
- [x] `lib/api/profile-picture.ts` + test: the upload and delete helpers.
- [x] `features/header/change-picture-dialog.tsx` (new) + `profile-header.tsx`: the avatar button (`/` only), the hidden file input, the dialog states and the save flow per the matrix.
- [x] `lib/shared/messages/header.ts`: the new copy.
- [x] `features/header/profile-header.test.tsx` + a new `change-picture-dialog.test.tsx`: every matrix row that can run in jsdom (stub `reencodeImage` there), plus axe.
- [x] `e2e/fixtures/header.ts`: the profile avatar tab stop; a Team A `mockPictureUpload` helper if useful.
- [x] `e2e/profile-picture.spec.ts` (new):
  - real-browser re-encode through the dialog, with test images generated in Node (a PNG via zlib with noise, a raw BMP, a JPEG with an EXIF APP1 segment, a corrupt `.png`);
  - assert the uploaded body (JPEG magic, ≤ 4 MB, no `Exif`, differs from the original);
  - the replace/delete order, cancel, too large, wrong type, 413, network + Retry;
  - keyboard-only flow; axe light/dark at desktop and 360 px; no button on `/account`.

**Acceptance Criteria:**
- Given the full check on Node 24, when it runs, then lint, typecheck, `check-forbidden`, Vitest (100% on `lib/server`/`lib/api`/`lib/shared`), the build and e2e are green.
- Given the diff, when it is listed, then no foundation file outside the brand-new `components/ui/image-reencode.ts` is changed.

## Implementation Notes

- **Human decisions (2026-10-15):**
  - The two foundation e2e edits that the avatar Tab stop required (`e2e/shell.spec.ts` and `e2e/fixtures.spec.ts` now read `...HEADER_TAB_STOPS.profile`) moved to the foundation PR #7 as commit `318eb7f` on `feat/NG-9027-foundation-tests-safeguard`. **Story 1.10 depends on PR #7 merging first.** On this branch alone those two foundation Tab-order tests fail until it merges; full verification runs on this branch combined with the PR #7 branch.
  - The implementer's error-handling choices are accepted as built:
    - after a 413/415 rejection, Save stays aria-disabled and points at the error until another file is chosen;
    - an `UNDECODABLE` re-encode at Save shows the "couldn't be used" line;
    - any other failure (other 4xx, 5xx, network) shows the connection line with Retry;
    - sizes round up, and files under 1 MB show in KB.
  - The possible initials flash (the preview is served no-store) is logged in `deferred-work.md` (Team A) as cosmetic; caching is unchanged.
- **Review patches (pass 1):** 13 findings patched (#1–#13), listed in the Review Triage Log; the delete-order deviation is recorded in the Spec Change Log.
- **Integration fix found in verification:** `lib/api/profile-picture.test.ts`'s upload and delete tests now load `myself` in a `beforeEach`, so the PR #7 safeguard has a page user. Without it those writes are blocked as "unpinned", which is correct behaviour. This has no effect on this branch alone.
- **Final verification (Node 24.22):**
  - **This branch alone:**
    - lint, typecheck and `check-forbidden` clean;
    - Vitest 3583/3583 at 100% coverage (`lib/server`/`lib/api`/`lib/shared`);
    - `pnpm build`, then the 1.10 e2e (`profile-picture`, `profile-header`): 42/42.
    - The full e2e on this branch alone fails only the two foundation Tab-order tests, until PR #7 merges.
  - **Combined with PR #7** (`318eb7f`, plus this branch, plus 1.10, in a temporary worktree):
    - lint, typecheck and `check-forbidden` clean;
    - Vitest 3650/3650 at 100% coverage;
    - `pnpm build`, then `CI=1 pnpm test:e2e`: 419 passed, 3 skipped by design.
- **Unit-test limits (MSW in jsdom):** handlers can't read multipart bodies, so the part is asserted by spying on `FormData.append`. The real bytes are asserted in `e2e/profile-picture.spec.ts`.

## Spec Change Log

- **2026-10-15, review pass 1 (#1, data safety):** the save order in the frozen Boundaries ("upload → delete old → read new id") is applied as "upload → read new id → delete the old id only when the new id is a file id different from it". This is the only reading that never deletes the user's current picture. The frozen text is unchanged; this note records the deviation for the human. **Known-bad state avoided:** a 2xx upload whose relation didn't switch deleting the only picture. **KEEP:** everything else in the save flow (bounded preload, set the key without refetch, toast, focus, Retry with the same blob, session handling).

## Review Triage Log

Pass 1 (blind hunter, edge-case hunter, verification gap):

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | blind, edge | The old picture is deleted before anything confirms the new one is current: a 2xx with an unreadable body, or no relation switch, deletes the user's only picture | medium | Real: `attempt` uploads, deletes, then reads. Deleting the current picture is never intended (the only reading), so → **patch**: read the new id first; delete the old one only when the new id is a file id different from it; if the read fails, skip the delete and revalidate. This deviates from the step order in the frozen Boundaries (data safety); see the Spec Change Log. |
| 2 | blind, edge | A Retry after a lost upload response deletes the first new upload and orphans the original public picture | low | Real (`before` is re-read per attempt) → **patch**: remember the first attempt's old id for this blob, and on success delete every earlier id that isn't the new one. |
| 3 | blind, edge | `SESSION_EXPIRED` on the delete or on the second id read is still reported as saved (toast, focus) | low | Real → **patch**: map both through `mapApiError`; `session` → the session outcome. |
| 4 | VG, blind, edge | A "Choose another file" evaluation resolving during a Save swaps the choice mid-save (dialog dismissable, Save enabled, then a "saved" toast) | medium | Real (`saveOf.file !== file` falls back to IDLE) → **patch**: drop pending evaluation results when a save starts and while saving. |
| 5 | edge | The header unmounts during evaluation: the object URL is created after unmount and never revoked | low | Real → **patch**: bump the evaluation token on unmount. |
| 6 | edge | The MIME aliases `image/jpg`, `image/pjpeg`, `image/x-bmp`, `image/x-windows-bmp` reject valid files | low | Real on some OS/browser pairs; a direct fix → **patch**. |
| 7 | blind, edge | Sizes just under 1 MB show "1024 KB" | low | Real; a direct fix → **patch**. |
| 8 | blind | Canvases aren't released between size steps (iOS canvas budget) → a spurious `UNDECODABLE` | low | Real; a direct fix (zero each canvas after use) → **patch**. |
| 9 | blind | The re-encoded blob is kept after close | low | Real; a direct fix (clear on close) → **patch**. |
| 10 | VG | No test picks a new file after a rejected or failed save | low | Real gap → **patch** (tests after 413 and after 502). |
| 11 | VG, blind | The latest-evaluation-wins guard and the close-time bump are untested | low | Real gap → **patch** (deferred `canDecodeImage`: Cancel then resolve; slow then fast). |
| 12 | VG | The preload error and timeout fallbacks are untested | low | Real gap → **patch** (an `onerror` stub, and fake timers past `PICTURE_PRELOAD_TIMEOUT_MS`). |
| 13 | VG | Session-expired close: no focus assertion | low | Real gap → **patch** (assert the avatar isn't focused). |
| 14 | edge | Another 4xx (400/403/404) shows the connection line with Retry | low | It matches the human-accepted error handling (2026-10-15: "any other failure shows the connection line with Retry"). Rejected. |
| 15 | blind | `UNDECODABLE` at Save, and a corrupt `.png`, show the user-fault copy with no Retry | low | Human-accepted choice, and it matches the AC ("an accepted extension the browser cannot decode" → the same line). Rejected. |
| 16 | blind | Decompression bombs; images are decoded twice | low | A self-inflicted tab crash only, from the user's own file; a pixel cap is not a direct fix. Rejected. |
| 17 | blind | An error present when the dialog opens may not be announced | maybe-false | An inserted `role="alert"` node is generally announced, and Save's `aria-describedby` names it. Settle with VoiceOver/NVDA; it would only be low. Rejected with this note. |
| 18 | blind | Close animations never play | low | Cosmetic; the fix restructures rendering. Rejected. |
| 19 | blind | No feedback between the picker closing and the dialog opening (decode time) | low | Sub-second for ≤ 6 MB in practice; no AC. Rejected. |
| 20 | blind | `profilePictureUploadName` keeps trailing dots and repeated `_` | low | Cosmetic; the proxy re-sanitizes the name. Rejected. |
| 21 | edge | `createImageBitmap`/`toBlob`/fetch never settles → stuck in "Saving…" | low | The upstream has 25 s timeouts and the browser APIs settle; not demonstrated. Rejected. |
| 22 | blind | Untested: the Close (X) button while saving, the header unmounting mid-save, EXIF orientation | low | The Close button shares `dismissible` with Escape (tested); the rest are not demonstrated defects. Rejected. |
| 23 | edge | Claim: `lib/api/profile-picture.ts` is a foundation module | false | FOUNDATION T1: `lib/api/<module>.ts` belongs to the area's team; the module header names Team A (Stories 1.9, 1.10). |

## Design Notes

- **Bounded preload:** preloading the new image before updating the key avoids the 1.9 initials flash. The wait is bounded (for example 5 s); then update anyway.
- **Preview of a valid file:** an object URL, revoked on close or when replaced.
- **Validation on choose:** the file is decoded once when chosen, so an undecodable file is caught before Save.

## Verification

**Commands** (Node 24: put `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin` first on PATH; never run e2e with `CI=1` without a fresh build):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met, exit 0
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
