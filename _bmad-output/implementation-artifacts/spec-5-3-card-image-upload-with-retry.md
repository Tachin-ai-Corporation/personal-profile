---
title: 'Story 5.3: Card image upload with retry'
type: 'feature'
created: '2026-10-21'
status: 'done'
route: 'dispatch'
baseline_commit: '3f3e5e4b7cae48f61c315631b654520944474401'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-add-and-edit-a-policy.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The policy editor (Story 5.2) has an empty Card images slot. Patients can't put photos of their insurance card on file, and nothing recovers an upload that fails after the policy saved (Story 5.3, FR29, NG-9029; acceptance source: `epics.md` "### Story 5.3: Card image upload with retry").

**Approach:**
- **Editor:** fill the editor's Card images group with a Front and a Back slot. Each one checks, previews and re-encodes the chosen file in the browser.
- **Save:** upload after the policy saves (front, then back). The policy save never fails because of an image. A failed upload is kept in memory for "Retry upload" on the card.
- **Replace:** a replaced image deletes the old file after the new one uploads. That needs a small shared change: the file-delete step must find all of a policy's card files, not only the newest (decision 1A).

## Boundaries & Constraints

**Always:**
- **Group:** placed below the Subscriber group, under a heading "Card images" (DRAFT), with the rules line "PNG or JPEG, up to 10 MB. Images upload after the policy saves.".
  - Two slots side by side, front | back, stacked below 768 px.
  - **Empty slot:** a dashed 120:76 tile "No image chosen" with "Choose front image" / "Choose back image".
  - **Saved image** (Edit): its thumbnail (5.1's download path) with "Replace".
  - **Chosen file:** a 120:76 preview with "{file name} · {size}" and ghost "Replace" / "Remove" buttons. Remove clears the unsaved choice only.
  - The file input is hidden and accepts `image/png,image/jpeg`. Each button opens it for that side.
- **Checks** (`features/insurance/card-file.ts`, before anything is uploaded; a rejection keeps the slot's previous state and shows an inline error that names the file):
  - **Type:** PNG or JPEG by MIME **and** leading bytes. SVG and anything else are refused: "{file name} isn't a PNG or JPEG image." (DRAFT).
  - **Size:** up to 10 MB: "{file name} is {size}. Choose a file up to 10 MB." (DRAFT).
  - **Dimensions:** at most 6000×4000 in either orientation (read with `createImageBitmap`): "{file name} is larger than 6000 × 4000 pixels." (DRAFT).
  - **Re-encode:** `reencodeImage(file, { format: "jpeg", maxBytes: 4 * 1024 * 1024, maxDims: { width: 6000, height: 6000 } })` from `components/ui/image-reencode.ts` (RC11). An `{ ok: false }` result is refused with `COMMON_MESSAGES.uploadRejected` ("{fileName} couldn't be used. Choose another file.").
- **Dirty and guard:** a chosen image makes the editor dirty, so the leave guard covers it. The guard's Save runs the same flow, images included. Nothing goes to `localStorage`.
- **Save flow:** the policy `POST`/`PUT` (5.2) first. Then, only if it succeeded, upload the front, then the back.
  - **Upload request:** multipart, one part `file`, to `insuranceCardUploadPath(policyId, side)`.
    - `policyId` comes only from the saved policy's answer (`POST`) or the edited policy (`PUT`), never typed.
    - The client sends no query: the proxy forces `isPublic=false`, 4 MB, PNG/JPEG.
  - **Replace:** before the upload, remember that side's old file id (from the policy being edited). After the new image uploads, delete the old file with `fileDeletePath(oldId)` (the named op). A refused or failed delete is quiet: it doesn't fail the save, shows nothing, and the new image stays. A session failure is handled by the shell.
  - **All uploaded:** the drawer closes, "Insurance saved." shows, the list refetches and the card shows the new thumbnails.
  - **An upload failed:**
    - The policy stays saved and the drawer closes. A warning toast reads "Insurance saved. Back image not uploaded." / "… Front image not uploaded." / "Insurance saved. Card images not uploaded." (DRAFT).
    - The card shows that side as the dashed "Image not uploaded" tile with a `link-text` "Retry upload" under it.
    - A 413/415 (`isUploadRejected`) is a rejection, not a retryable failure. The toast names the file as not usable, and that image is dropped.
- **Pending images:** the re-encoded blob is kept only in memory (a module-level store in `features/insurance`, never storage), keyed by policy id + side, until it uploads or the page reloads. Deleting a policy (5.5) drops its entries.
- **"Retry upload"** (decision 2A: shown only for uploads that failed in this session):
  - If the image is still in memory, only that upload is retried. Success shows the thumbnail and "Insurance saved." (DRAFT: "Card image uploaded.") and refetches. Failure keeps the tile and shows `toastError` with Retry.
  - If the image isn't in memory, it opens that side's file picker. The chosen file goes through the same checks, then uploads directly.
- **Foundation PR (decision 1A):** see Code Map. It is built off `origin/main` as its own branch and PR for both teams' review. A copy of the commit is kept on this branch until it merges.
- **Copy:** grep first (`COMMON_MESSAGES.replace`, `remove`, `uploadRejected`, `INSURANCE_MESSAGES.imageMissing`). New strings go in `lib/shared/messages/insurance.ts`, marked DRAFT unless verbatim.
- **Quality:** axe light and dark (the drawer with slots, a card with Retry), 44 px targets, 360 px with no horizontal scroll, keyboard-only choose, replace and remove.

**Decisions (human, 2026-10-21):**
- **1A, card relations in the file-delete step (replace, then delete):**
  - A small shared-code PR off `origin/main` adds the insurance-card relation lookup to the named op `DELETE /api/pp/file/{fileId}`, for both teams' review. A copy of the commit is kept on this branch until it merges.
  - If the live backend refuses the delete (e.g. the GraphQL lookup doesn't work there), the app keeps the new image and fails quietly.
  - "Test the card delete on demo" is logged in `deferred-work.md`.
- **2A, Retry only for this session's failures:**
  - "Retry upload" shows only for an upload that failed in this session.
  - After a reload, a missing side shows 5.1's plain "Image not uploaded" tile, and the image is added through Edit.
  - If the in-memory image is gone while the Retry still shows, Retry opens that side's file picker.
- **3A, upload ownership gap accepted:** the policy id comes only from the policy just saved or the user's own list, never from input. The existing deferred-work item for the backend stays open.

**Never:**
- Upload before the policy saves.
- Send `isPublic` or `hardDelete`.
- Use `DELETE /api/1h/v2/file/**`, which the proxy denies.
- Store image bytes anywhere but memory.
- Fail the policy save because of an image or a delete.
- Edit `features/shell/**`, `components/ui/*` (existing files), `lib/api/{index,keys}.ts` or `test/**` without asking. The decision 1A change goes only in its own foundation commit.
- Push. Commit locally only, after the checks and the review.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add with both images | new policy + front.png + back.jpg | `POST` → then upload front, then back (`InsuranceHas…CardFile`, no query); "Insurance saved."; card shows both | N/A |
| Reject type / size / dims | card.svg; 12 MB jpg; 8000×3000 png | inline error naming the file; slot unchanged; nothing sent | inline |
| Re-encode fails | undecodable "png" | "{file} couldn't be used. Choose another file."; slot unchanged | inline |
| Back upload fails | `POST` ok, front ok, back 500 | drawer closes; toast "Insurance saved. Back image not uploaded."; card back = tile + "Retry upload" | toast |
| Retry (in memory) | "Retry upload" on back | only the back upload is sent; success → thumbnail | toast + Retry on failure |
| Retry (not in memory) | "Retry upload" with no stored blob | file picker for back → checks → direct upload | inline/toast |
| Replace | Edit, Replace front, Save | `PUT`, upload new front, then `DELETE /api/pp/file/{oldFrontId}` | delete refused/failed → quiet, new image kept |
| Rejected upload | upload answers 413/415 | toast names the file as not usable; no Retry for it | toast |
| Remove unsaved choice | choose, then Remove | slot back to its previous state; no request | N/A |
| Guard | choose an image, then close | leave guard; Save there runs policy + images | guard |

</frozen-after-approval>

## Code Map

- **Decision 1A, foundation PR:**
  - **Branch:** `feat/foundation-file-delete-card-relations` off `origin/main`.
  - **Change:** `lib/server/named-ops/file-delete.ts` (+ test). `cardIds` keeps the list read (the caller's policy ids and the newest files). It then asks GraphQL for every card relation of those policies and adds those file ids to the owned set.
  - **Query:** modelled on `SIGNATURE_FILES_QUERY` / `signatureRelationIds`, e.g. `query ($filter: InsuranceFilterInput) { Insurance (filter: $filter) { records { InsuranceHasFrontSideCardFile { relations { record { id } } } InsuranceHasBackSideCardFile { relations { record { id } } } } } }` with the filter `id in [policy ids]`. Use the filter form the GraphQL schema accepts (`GraphQLQueryProvider.java:60-85`). It is not verified live.
  - **Failures:** a GraphQL error or an unexpected shape fails closed (502), as for Signature.
  - **Tests:** the old card id is deletable; a stranger's id is not.
  - **Copy:** the same commit is kept on the Epic 5 branch until the PR merges.
- `features/insurance/card-file.ts` (+ test): the type, size and dimension checks plus the re-encode wrapper. Use `canDecodeImage`/`reencodeImage`.
- `features/insurance/pending-cards.ts` (+ test): the in-memory store `{ policyId, side } → { blob, name }`.
- `features/insurance/card-images.tsx`: the two slots in the editor (5.2 left a slot after the Subscriber group in `policy-editor.tsx`).
- `features/insurance/use-insurance-editor.ts`: `save()` gains the upload and replace steps after the policy write, and the dirty state includes the chosen images.
- `features/insurance/policy-card.tsx`: the "Retry upload" link under a failed side.
- `lib/api/insurance.ts` (+ test, 100 %): `uploadInsuranceCard(policyId, side, blob, name)` (multipart, like `uploadSignature` in `lib/api/personal.ts:137`), never throws.
- `lib/server/proxy/allowlist/insurance.test.ts`: confirm or add the AC's proxy tests (413, 415, a client `isPublic=true` reaching upstream as `false`, no client query).
- **Models:**
  - `features/personal/signature-save.ts`: upload, re-read, delete the old file best effort;
  - `features/header/change-picture-dialog.tsx`: old ids cached per file;
  - `e2e/fixtures/core.ts` `mockFileDownload` and the picture e2e for multipart mocks.
- **Tests:**
  - unit: `features/insurance/card-images.test.tsx` plus the editor save tests;
  - e2e: extend `e2e/profile-insurance.spec.ts`, with fixtures `mockInsuranceCardUpload` and a `/api/pp/file/*` mock.

## Tasks & Acceptance

**Execution:**
- [x] Foundation (decision 1A): `lib/server/named-ops/file-delete.ts` (+ test) card relations. Keep it a separate, self-contained change; the orchestrator commits it on its own and makes the PR branch.
- [x] `lib/api/insurance.ts` (+ test), `lib/shared/messages/insurance.ts` -- the upload call and the copy.
- [x] `features/insurance/*` (+ unit tests: every I/O row, axe light and dark) -- checks, store, slots, the save steps, Retry on the card.
- [x] `lib/server/proxy/allowlist/insurance.test.ts` -- the AC's proxy cases, if missing.
- [x] `e2e/fixtures/insurance.ts`, `e2e/profile-insurance.spec.ts` -- the add-with-images, failure + Retry, replace and rejection journeys, at 360 px.
- [x] `sprint-status.yaml` (the `5-3` line only).
- [ ] After review (orchestrator): commit locally (the foundation copy first, then the story; no push), then the local-view merge and `dev-mock.ts` (card upload with a new relation per upload, the list showing the newest, the GraphQL card relations, deletes), and typecheck there.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100 % coverage on `lib/server`, `lib/api` and `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed, or each other path was approved by the user and is in its own commit.

## Implementation Notes

- **Decision 1A (own commit: `lib/server/named-ops/file-delete.ts` + test only):** `cardIds` now also collects the listed policies' ids. A fifth lookup, `cardRelationIds`, runs **last** (after the Signature relations), only when the id wasn't found earlier and only when the list had policies: `INSURANCE_CARD_FILES_QUERY` with `{ filter: { id: { in: [policy ids] } } }` (`id` is an INTEGER instance attribute, `in` is one of its operators: `TypeImpl.java:325`, `RSQLOperatorsExtend`). GraphQL `errors`, another shape, a 4xx or 5xx fail closed (502; 401 → `TOKEN_EXPIRED`). Placed last so a backend that refuses the query only blocks older-card deletes, never the Signature ones that already work. Not verified live (deferred: "Test the card delete on demo"). The GraphQL root's default page is 50 records and relations 50 per side; beyond that an older card isn't found (404 `NO_FILE`, quiet in the app).
- **`lib/api/insurance.ts`:** `uploadInsuranceCard(policyId, side, blob, name)` (one `file` part named `insuranceCardUploadName(name, side)` = sanitized base + `.jpg`, no query, a 2xx with an unreadable body counts as uploaded, a non-positive id sends nothing), `deleteInsuranceCardFile(fileId)` (the named op), `insuranceSavedPolicyId(data)` (the `POST` answer's `InsuranceDTO.id`).
- **Features:**
  - `card-file.ts`: `checkInsuranceCardFile` (MIME + leading bytes, 10 MB, `createImageBitmap` 6000 × 4000 either way, then `reencodeImage(INSURANCE_CARD_REENCODE)`); an undecodable file (bitmap fails) is `COMMON_MESSAGES.uploadRejected` like a failed re-encode. `insuranceFileSize` reuses `HEADER_MESSAGES.fileSizeKb/Mb`.
  - `pending-cards.ts`: module-level map `{policyId}:{side}` → `{ blob, name, oldFileId }` with `useSyncExternalStore`; `dropInsurancePendingCards(policyId)` is ready for 5.5. `oldFileId` is kept so a Retry after a failed replace still deletes the old file.
  - `card-upload.ts`: `uploadInsuranceCardImage` (upload → quiet delete; failure → pending; 413/415 → dropped) and `insurancePartialToast` ("Insurance saved." + "Card images not uploaded." / "{Side} image not uploaded." / the `uploadRejected` sentence per rejected file), shown with `toastPartial` (the warning tone).
  - `use-insurance-editor.ts`: `images` / `imageErrors` / `imageChecking` per side, preview object URLs created on choice and revoked on replace, remove, close and unmount; a chosen image makes the editor dirty; the save awaits any check in flight, then sends the policy, then uploads front then back (policy id from the `PUT` policy or the `POST` answer; without one nothing uploads and the toast says so), then refetches once.
  - `card-images.tsx`: the group below the Subscriber group; each slot keeps its first button as one element across Choose / Replace (focus stays after a choice; Remove moves focus back to it). Replace / Remove carry "Replace {side} image" / "Remove {side} image" names (two slots).
  - `card-retry.tsx` + `policy-card.tsx`: a pending side shows the "Image not uploaded" tile (even when the list still has an older file of that side, as the spec says) with a `link` (`text-link-text`, 44 px) "Retry upload" named "Retry upload of the {side} image". Success → `toastSuccess("Card image uploaded.")` (the spec's DRAFT alternative) + refetch; failure → `toastError("{Side} image not uploaded.", { onRetry })`; rejection → `toastPartial(uploadRejected)` and the entry drops; no blob → the side's picker, the same checks (inline error under Retry), then a direct upload.
- **Copy** (`messages/insurance.ts`): verbatim "PNG or JPEG, up to 10 MB. Images upload after the policy saves.", "No image chosen", "Choose {side} image", "Retry upload"; the rest DRAFT.
- **Tests:** `card-file.test.ts`, `pending-cards.test.tsx`, `card-images.test.tsx` (every I/O row, guard Save, check-in-flight, axe light and dark: drawer with slots + a card with Retry); proxy upload cases through the real handler (`isPublic=true` → `false`, no query, 413, 415 SVG/BMP, `BAD_QUERY`, `BAD_BODY`, owner id); e2e `Card image upload with retry (Story 5.3)` (7 journeys × desktop and 360 px with real-browser images built in the spec), fixtures `mockInsuranceCardUpload`, `mockInsuranceFileDelete`. Two 5.2 e2e locators now use `{ name: "Back", exact: true }` ("Choose back image" also matched).
- **Verification (Node 24.22.0):** lint, typecheck, `check-forbidden` clean; `vitest run --coverage` 6,909 tests (228 files), 100 % on lib/server, lib/api, lib/shared; `pnpm build` passed; `CI=1 pnpm test:e2e` 1,119 passed, 14 skipped, 1 flaky (the 5.2 keyboard-only journey: a Radix Select value not yet shown under full-suite load, passed on retry; it passed 3/3 in `profile-insurance.spec.ts --repeat-each=3`, 150 passed / 6 skipped).
- **Review fixes (pass 1, coordinator):** the card relations lookup selects each record's `id` and keeps only the caller's policies (the filter isn't trusted); lookup-order test (an older Signature deletes while the card query fails); a file refused while Save waits for its check stops the save (inline error, focus on that slot's first button, nothing sent); Retry is single-flight (ref) and dismisses the earlier error toast; a session failure shows no toast (editor and Retry); the unmount cleanup drops late checks; the dimension check reads the PNG IHDR / JPEG SOF0-2 header (no decode before the re-encode; an unreadable header is "couldn't be used"); `image/jpg`, `image/pjpeg` and an empty MIME (bytes decide) are accepted; a failed side that still has a saved file shows that thumbnail with Retry under it (the tile only when nothing is saved); inline errors wrap anywhere; insurance-owned size strings (`chosenFileKb/Mb`, `cardTooLarge` in MB); `card-upload.test.ts`; the e2e multipart parser throws on a part without a header terminator; three deferred-work items (rows 10, 14, 18).

- **Orchestrator, after review:**
  - **Test fix:** four Retry tests in `card-images.test.tsx` now wait for the request log (the success toast can fire before the list refetch is logged). A full run had failed once on that race.
  - **Commits:** the file-delete card-relations change is committed on its own (foundation copy), and the same change is on `feat/foundation-file-delete-card-relations` off `origin/main` for its PR.
- **Final verification (orchestrator, Node 24.22):**
  - Lint, typecheck and `check-forbidden` are clean.
  - Vitest: 6951/6951 (229 files), 100 % on `lib/server`, `lib/api` and `lib/shared`. One unrelated Personal test failed once in a loaded run, then passed alone 3/3 and in the full rerun.
  - `pnpm build` passed.
  - `CI=1 pnpm test:e2e`: 1119 passed, 14 skipped, 1 flaky (the known foundation `primitives.spec.ts:75` tooltip-Escape flake).

## Spec Change Log

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | B | The card-relations lookup trusts the GraphQL filter. If the unverified `{ id: { in } }` filter is ignored, every tenant card file counts as "owned" and can be hard-deleted | high | Real: `insuranceCardFileIds` accepts every returned record. A direct guard → **patch** (foundation commit): select `id` on the records and keep only the caller's policy ids; test a stranger's record in the answer. |
| 2 | E, B | A file rejected while Save waits for its check is dropped silently: the save goes on, "Insurance saved." shows, and the earlier choice (or nothing) uploads | medium | Real (`sendOnce` awaits the checks and never looks again) → **patch**: after the checks, a new rejection stops the save before any request; the drawer stays open with the inline error. |
| 3 | E, B | The error toast's Retry bypasses the busy guard (stale state), so two uploads can run at once (an extra relation, the old file deleted twice); a stale error toast stays after success | medium | Real → **patch**: an in-flight ref, and dismiss the earlier toast when an upload starts or succeeds. |
| 4 | E | A session failure during an upload still shows the "not uploaded" toast next to the session dialog | low | Real; direct → **patch**: on a session failure, no toast. |
| 5 | E, B | A check that finishes after unmount creates an object URL nobody revokes, and sets state on an unmounted hook | low | Real (unmount doesn't bump `sessionRef`) → **patch**. |
| 6 | E, B | The dimension check fully decodes the image (`createImageBitmap`) before rejecting it; a small file declaring huge dimensions can exhaust memory, and a valid 24 MP image is decoded twice | medium | Real → **patch**: read the dimensions from the PNG IHDR / JPEG SOF header before any decode. |
| 7 | E | An empty or alias MIME type (`""`, `image/jpg`, `image/pjpeg`) for a valid PNG/JPEG is refused | low | Real (browsers vary) → **patch**: accept the aliases; with an empty MIME, the leading bytes decide. |
| 8 | E, B, VG | After a failed replace, the card hides the still-saved old image behind "Image not uploaded", while Edit shows it as saved | medium | Real and contradictory. The frozen spec's tile wording fits a side with no image → **patch**: a side whose upload failed but still has a saved file shows that thumbnail with "Retry upload" under it; the tile only when nothing is saved; test it. |
| 9 | B | Long file names in inline errors don't wrap (120 px Retry column, the slots) | low | Real; CSS → **patch**: let the message wrap anywhere; one 360 px case. |
| 10 | B | Insurance file sizes use `HEADER_MESSAGES.fileSize*` (another area's copy) | low | Real → **patch**: own strings in `INSURANCE_MESSAGES`. Sharing the leading-byte and size helpers with `features/header` would be a foundation helper → **defer** (Foundation). |
| 11 | B | The e2e multipart parser doesn't check for a missing header terminator | low | Real; direct → **patch**. |
| 12 | VG | Untested: the lookup order (Signature relations before card relations), which keeps a failing card query from blocking an older Signature's delete | low | Gap as filed → **patch**: a test with older Signature relations, a policy and a failing card read: the Signature delete is 204. |
| 13 | VG | Untested: mixed partial-toast outcomes (one failed + one rejected, both rejected) | low | Gap as filed → **patch**: a table test of `insurancePartialToast`. |
| 14 | B, E | `POST` may return an existing tenant policy (`createOrFetchInsurance`), so the new images, and the delete ownership, then apply to a policy record another patient also has | medium | Real, but rooted in the backend's sharing of policy records (the duplicate-on-POST item); the app can't tell a fetched record from a new one → **defer** (backend/security): extend that item. |
| 15 | E, B | GraphQL `records` / `relations` may be paged (default 50), so an older card past the limit gets a quiet 404 | low | Fails closed (leftover only), and needs more than 50 policies or relations per side → rejected. |
| 16 | B, E, VG | The "image not in memory → open the picker" Retry path can't be reached in the product (nothing stores a `null` blob) | low | Spec-mandated defensive path (frozen spec), harmless and tested → rejected. |
| 17 | B | The shared file-delete change is bundled into the story diff | false | By decision 1A it ships as its own foundation PR off `main`, with a copy commit here. The orchestrator splits it. |
| 18 | B | No telemetry for upload, retry and delete outcomes | low | A telemetry event is a shared union (`lib/shared/telemetry`) → **defer** (Foundation), useful for the demo check of the card delete. |
| 19 | B | The toast for a `POST` answer without an id reads like a retryable failure | low | The backend always returns the id → rejected. |

## Design Notes

**Backend facts** (1h-ng-bo-core-be, read 2026-10-21):
- **Uploads:** each upload adds a new card relation, and the old file stays related (`FileServiceImpl.java:1077-1088, 1382-1391`). The list shows only the newest file per side (`OneHealthRepository.java:2484, 2499`).
- **Ownership:** the upload checks only the tenant (`OneHealthServiceImpl.java:4549-4562`).
- **Hard delete:** it removes the file rows and relations, but the S3 delete targets the public bucket, so private card bytes stay (already in deferred work).
- **Policy delete:** it removes only the newest front and back files, so older cards are orphaned (a backend item to log).

**Agent decisions:**
- **Upload ordering:** front then back, sequential, stopping neither on the other's failure. Each side reports on its own.
- **Uploaded file id:** the upload answer's id isn't trusted. The refetch decides what the card shows.

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; also put `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/af4a8bf2-5800-44b7-adc9-13891a6c3dc2/scratchpad/shim` first; the implementer makes no commits; never `pnpm dev` here; never `CI=1` e2e without a fresh build):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
