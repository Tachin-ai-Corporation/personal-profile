---
title: 'Story 2.4: Signature'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '743bf75fa0d6ce1e2e55d84b092e91ce76bb00ee'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Signature row in Personal information is read-only (2.1–2.3). Users can't draw, upload, replace or remove the Signature that documents they sign carry (Story 2.4, FR14, NG-9022; acceptance source: `epics.md` "### Story 2.4: Signature").

**Approach:** Put a `signature_pad` 5.1.4 pad in the edit view's Signature row, as `features/personal/signature-pad.tsx`. Save it as a second step after the Story 2.2 PUT, through `runSaveSteps`:
- a new Signature is uploaded;
- a replacement is uploaded, then the old file is deleted through the ownership-checked named op;
- a removal is confirmed with `ConfirmDialog`, then deleted the same way.

Every uploaded Signature passes through `reencodeImage`, so it is a PNG of at most 1 MB. Signature ids come only from `myself.signature`.

## Boundaries & Constraints

**Always:**
- **Pad** (`signature-pad.tsx`, a direct wrapper of `signature_pad`, no `react-signature-canvas`):
  - Size and look: full value-column width capped at 480 px, 160 px tall, 1 px `control-border`, `rounded-md`, and a baseline rule. The colours follow the paper decision below.
  - The cue "Draw your signature" shows while it is empty.
  - Input: pointer events (mouse, touch, pen), with `touch-action: none` on the canvas only.
  - The canvas is sized for `devicePixelRatio` and keeps its content on resize and rotation (re-drawn from `toData()`, or from the loaded image).
  - Below it: "Clear" (ghost) and "Upload image instead" (ghost, upload icon), both 44 px tall and keyboard operable. The file input is visually hidden behind the button.
  - Help line: "Draw with a mouse, finger or pen, or upload a PNG or JPEG.". The AC's "Saved {date}." is omitted, because `myself.signature` is `{id, name}` and no file date exists.
  - Accessibility: the canvas has `role="img"`, the name "Draw your signature", and `aria-describedby` pointing at the help line plus a visually hidden "Drawing needs a mouse, finger or pen. To add your signature with a keyboard, use Upload image instead.".
- **Edit open:** a saved Signature is loaded into the pad from `fileDownloadPath(myself.signature.id)` (same origin, so the canvas is not tainted). The Section stays clean until the user draws, clears or uploads.
- **Form value:** a 16th form value `signature` holds only a state token: `"saved"`, `"none"`, `"cleared"` or `"new:<n>"`. The pending PNG `Blob` lives in a Section ref keyed by `<n>`. The baseline is `"saved"` with a saved Signature, `"none"` without. The first stroke, a Clear (of a saved Signature) or an accepted upload makes it dirty. `signature` is never in `draftFields` (the denylist would throw), and a restored draft leaves it as is, so the pad shows the saved Signature.
- **Upload:**
  - Only PNG or JPEG is accepted: the MIME type and the leading bytes (`89 50 4E 47 0D 0A 1A 0A` / `FF D8 FF`) are checked in `features/personal`, because a feature can't import `features/header`.
  - Anything else shows "Choose a PNG or JPEG image." under the pad and leaves the pad unchanged.
  - An accepted file goes through `reencodeImage(file, { format: "png", maxBytes: SIGNATURE_MAX_BYTES (1 MB), maxDims: 2× the pad's CSS size })` and is shown in place of any drawing.
  - `{ ok: false }` shows "This image is too large. Choose a smaller one." and leaves the pad unchanged.
- **Save** (`save(values, baseline)` → `runSaveSteps([...], { scope: "personal", mode: "stop", refetch, rebase })`). The steps run in this order:
  1. `user-edit`: the Story 2.2/2.3 PUT, skipped when nothing else changed.
  2. `signature`, one of:
     - **New** (baseline `"none"`): export the pad (or take the uploaded Blob), pass it through the same `reencodeImage` call, and upload it as part `file`, filename `signature.png`, to `POST signatureUploadPath()` (`v2/health/type/Person/me/relation/PersonHasSignatureFile/file/upload`) with no query. The proxy forces `isPublic=false`.
     - **Replace** (baseline `"saved"`, value `"new:<n>"`; human decision, see Decisions): upload as above. Re-read `myself`, and if its `signature.id` differs from the old id, delete the old id through `fileDeletePath(oldId)` (`DELETE /api/pp/file/{fileId}`, ownership-checked). This delete is best effort: only a session failure fails the step, as in 1.10.
     - **Remove** (baseline `"saved"`, value `"cleared"`): only after the confirm, delete `myself.signature.id` through `fileDeletePath`. Then re-read `myself`, and while a `signature` is still present (an older leftover relation), delete that too, up to 5 rounds. A failure fails the step.
  - The old id is read only from the `myself` the save starts from, never from input, the URL or an upload response.
  - The client never sends `isPublic`, `current` or `hardDelete`; a unit test asserts this for every request URL.
- **Confirm** (`confirmBeforeSave`): with value `"cleared"` and a saved Signature, `ConfirmDialog variant="destructive"` opens.
  - Copy: title "Remove your signature?", body "Documents you sign will no longer carry it.", "Cancel" (initial focus) and "Remove signature".
  - "Remove signature" resolves `true`.
  - Cancel or Escape resolves `false`, so the save is `CANCELLED`: nothing is sent for this Section, it stays in edit with the pad empty, and focus returns to the trigger. Save all counts it as cancelled.
- **Outcomes:**
  - **Success:** `mutateMyself()`; the read view shows the new thumbnail (a new file id, so never the old image) or "Not provided"; the toast "Personal information saved."; focus on the `h2`.
  - **Signature step failed after the PUT:** `{ ok: false }`, refetch `myself` and rebase so the saved fields are clean. The Section stays in edit with the pad content kept and shows "Couldn't save your signature. Try again." (`describeError` when `failedParts` includes `signature`). Retry sends only the Signature step.
- **Proxy:** remove the `POST v2/file/{fileId}/version` entry (and its test) from `allowlist/personal.ts`. The entry-list test then asserts it is absent, and a test asserts the path is no longer allowlisted. The upload entry stays as built (F2).
- **Copy:** new `PERSON_MESSAGES` keys: the cue, help, keyboard instruction, both upload errors, the confirm and the step failure. DRAFT COPY where the AC says so. Reuse `COMMON_MESSAGES.clear` and `COMMON_MESSAGES.cancel` where they fit.
- **Deep link:** `#signature` stays on the row in both views (the 2.1 anchor and `rowId`).

**Decisions (human, 2026-10-16):**
- **Replace = upload + ownership-checked delete; the version entry is removed.** The backend's `POST v2/file/{id}/version` checks only the tenant, not ownership, and the proxy entry accepted any numeric id, so a crafted request could replace another person's Signature in the same tenant. The upload is forced to the caller's own person (`me`), the delete is ownership-checked on the server, and `myself` shows the newest Signature. This departs from the AC's version step.

- **Old-file ownership (human, 2026-10-16, review renegotiation):** the named op proved Signature ownership only through `myself.signature` (the newest relation), so after the upload the old id was "not owned" and every replace left the old file behind. It now also accepts any of the caller's `PersonHasSignatureFile` relations, through a last-run GraphQL lookup. That is foundation commit `3d40ac1` on `feat/NG-9022-signature-ownership`, cherry-picked here as `a0c01dc`. Replace stays upload, then delete of the old id.
- **Paper pad in both themes (human, 2026-10-16).** The pad is a light "paper" in light and dark: background `bg-qr-surface` (the theme-constant white surface, white in both themes), ink `--graphite` (tier 1, read with `getComputedStyle` for `signature_pad`'s `penColor`), the cue and the baseline in `--slate` (tier 1, about 6:1 on white; an arbitrary `var()` value, not a palette class). The exported PNG always has dark ink on a transparent background, and saved or uploaded images look the same in both themes. This replaces the AC's "ink in `--foreground`" and "background surface". The read-view `SignatureThumb` (foundation) shows dark-ink images on the dark background in dark mode; that is logged in deferred-work as a Foundation item (a theme-constant paper background on the thumbnail, and a generic paper-surface token instead of reusing `qr-surface`).
- **Spec size:** about 3,100 tokens, kept whole because it is one goal (self-approved per the user's instruction, as for 2.2).

**Never:**
- Don't edit `features/shell/**`, `features/header/**`, existing `components/ui/*`, `lib/api/{index,files,keys,client}.ts`, `lib/server/**` other than `allowlist/personal.ts` and its test, `lib/shared/bff-contract.ts`, foundation message files, `test/**` (except `test/page-handlers/profile.ts`), or `e2e/fixtures/{core,index}.ts`.
- Never take a Signature file id from user input, the URL, an upload response or a draft. Never send a data URL anywhere.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New drawn | no saved Signature; draw; Save | one `file` upload (PNG ≤ 1 MB, `signature.png`, no query); myself refetched; thumbnail; toast; `h2` | N/A |
| Replace | saved id 41; upload a JPEG; Save | re-encoded PNG upload; re-read myself → id 57; `DELETE /api/pp/file/41` | old delete fails → still saved (best effort) |
| Remove | saved id 41; Clear; Save; confirm | dialog → "Remove signature" → `DELETE /api/pp/file/41`; myself shows none → "Not provided" | leftover id 30 → deleted too (≤ 5 rounds) |
| Remove cancelled | Clear; Save; Cancel or Escape | nothing sent for this Section; edit kept, pad empty; `CANCELLED`; focus back | Save all counts it cancelled |
| Clean open | saved Signature; Edit | pad shows the saved image; not dirty; Save sends nothing | image fails → empty pad, still clean |
| Bad file | upload `.gif` or a renamed text file | "Choose a PNG or JPEG image."; pad unchanged | N/A |
| Too large | `reencodeImage` → `{ ok: false }` | "This image is too large. Choose a smaller one."; pad unchanged | N/A |
| PUT ok, signature fails | first name + drawing; upload 500 | first name saved and clean; "Couldn't save your signature. Try again."; Retry sends only the upload | stays in edit |
| Drafts | draw, then the session expires | the stored draft has no `signature` key and no data URL or Blob; a restore shows the saved Signature | N/A |
| Proxy | `POST v2/file/41/version` | not allowlisted: 403 `NOT_ALLOWED` (`handler.ts:130`) | N/A |

</frozen-after-approval>

## Code Map

- `features/personal/personal-section.tsx` -- `signatureThumb`, the Signature edit row (`ReadOnlyValue` today, `rowId: SIGNATURE_ANCHOR`), `useSectionForm` options (add `confirmBeforeSave`, `describeError`, `save` through `runSaveSteps`), the post-save rebase from 2.3.
- `features/personal/schema.ts` -- add the `signature` token to `PersonalValues`, `toPersonalValues` (`"saved"`/`"none"`), the diff (never sent in the PUT), `PERSONAL_FIELD_ORDER`; `PERSONAL_DRAFT_FIELDS` stays 14.
- New `features/personal/signature-pad.tsx` (+ test), `features/personal/signature-file.ts` (+ test: PNG/JPEG MIME + leading bytes), `features/personal/signature-save.ts` (+ test: the step builder).
- `components/ui/image-reencode.ts` -- `reencodeImage(blob, { format, maxBytes, maxDims })` → `{ ok, blob, width, height } | { ok: false, reason }`.
- `components/ui/confirm-dialog.tsx` -- `ConfirmDialog({ open, title, body, confirmLabel, variant, onConfirm, onCancel, cancelLabel?, busy? })`.
- `features/shell` -- `runSaveSteps(steps, { scope, mode, refetch, rebase })` (`{ part, skip?, run }` steps → `failedParts`), `confirmBeforeSave`, `CANCELLED_CODE`, `SignatureThumb`, `fileDeletePath` via `lib/api/files.ts`.
- `lib/api/personal.ts` -- add `signatureUploadPath()` and `uploadSignature(blob)` (FormData `file`, `signature.png`; copy `uploadProfilePicture`'s 2xx rule in `lib/api/profile-picture.ts:63-69`) and `deleteSignatureFile(id)` through `fileDeletePath`.
- `lib/server/proxy/allowlist/personal.ts:98-117` -- `SIGNATURE_MAX_BYTES`; the upload entry stays; remove the version entry. `personal.test.ts:11-25` is the exact entry list; `:52-60` is the version test to replace with an absence test.
- `lib/server/named-ops/file-delete.ts` -- already accepts the caller's own `myself.signature.id` (`file-delete.test.ts:61`), forces `hardDelete=true`, and answers 404 `NO_FILE` otherwise.
- Backend facts: upload adds a new relation (never replaces); `myself.signature` is the newest relation (`id desc limit 1`); hard delete removes the relation; no file date anywhere.
- `signature_pad` `^5.1.4` is in `package.json` and not yet used.
- e2e: `mockProfileDefaults`, `mockProxy`, `mockFileDownload`, `PNG_1X1`, `e2e/fixtures/personal.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/proxy/allowlist/personal.ts` (+ test) -- remove the version entry; the absence test; the entry list.
- [x] `lib/api/personal.ts` (+ test) -- `signatureUploadPath`, `uploadSignature`, `deleteSignatureFile`; no `isPublic`/`current`/`hardDelete` in any URL.
- [x] `lib/shared/messages/person.ts` -- the new keys.
- [x] `features/personal/signature-file.ts` (+ test) -- type and leading-bytes check.
- [x] `features/personal/signature-pad.tsx` (+ test) -- the pad: DPR, resize, cue, Clear, upload button, a11y, loaded image, the paper colours (Decisions).
- [x] `features/personal/signature-save.ts` (+ test) -- the step builder for each branch (new, replace incl. a failed old delete, remove incl. leftovers, step failure).
- [x] `features/personal/schema.ts` (+ test) and `features/personal/personal-section.tsx` (+ test) -- the token, the confirm, the save wiring, `describeError`, every matrix row, drafts without Signature data, axe.
- [x] `e2e/profile-personal.spec.ts` (+ `e2e/fixtures/personal.ts`) -- UJ-3: `?tab=contacts#signature` → Edit → draw → Save → toast → thumbnail; Clear → Save → confirm Cancel and Remove; upload a PNG; 360 px; axe light/dark.
- [x] `_bmad-output/implementation-artifacts/{sprint-status.yaml,deferred-work.md}` -- the `2-4` line; resolve the signature-version ownership entry; the thumbnail dark-mode Foundation item.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100% coverage on `lib/server`, `lib/api`, `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed.

## Implementation Notes

- **`failedParts` for `describeError`:** the shell's `SaveError.failedParts` is typed `readonly AccountSavePart[]`, so `save()` can't return the Personal parts. The Section keeps the last save's `failedParts` in a ref and `describeError` reads it: the Signature copy shows when `signature` failed and `user-edit` did not (a failed PUT keeps the Section's own copy). Widening the type is a Foundation item in `deferred-work.md`.
- **The PUT step:** `lib/api/personal.ts` gains `sendPersonalInformation(diff)` (the raw `PUT v2/user/edit` answer, 2xx rule) for the `runSaveSteps` step; `savePersonalInformation` had no caller left and is removed. An accepted upload is re-encoded once, when it is chosen; a drawing is re-encoded at Save. A replace whose re-read still shows the old id fails the step; a removal treats 404 `NO_FILE` as already deleted (`isSignatureFileGone`). Save revalidates `myself` through `mutate(keys.myself())` (refetch and final success); the steps' own re-reads use `fetchMyself()`.
- **Local failures** (nothing to export, re-encode `{ ok: false }`) throw inside the step, so `runSaveSteps` maps them `UNEXPECTED` and the Section shows "Couldn't save your signature. Try again.".
- **Signature errors:** a network failure keeps the connection copy (`describeError` returns `undefined`). The `signature` token is a plain `z.string()` (set only by code) and is not in `PERSONAL_FIELD_ORDER`.
- **Remove rounds:** the saved id is deleted, then up to 5 more leftover relations (`SIGNATURE_REMOVE_ROUNDS`); one still left after that fails the step.
- **Remount:** the edit table swaps its layout at 768 px (a tablet rotation), which remounts the pad. The pad reports its content (`SignaturePadMemory`: strokes, the shown saved or uploaded image) to the Section, which hands it back on mount, so a drawing survives the swap (unit + e2e). It is cleared when the edit ends.
- **Label:** the row label's `for` points at the canvas (`role="img"`, name "Draw your signature"); a canvas isn't labelable, so the name comes from `aria-label` (axe clean in jsdom and both browsers' themes).
- **No 2d context:** the pad isn't created; "Upload image instead" still works.
- **Integrator (T8):** `docs/FOUNDATION.md` still lists the `v2/file/{fileId}/version` entry (§3.1 allowlist row, §5 Story 2.4 row, §6 Team A "Signature-version … ids come from the client"); update it when this lands.

- **Final verification (Node 24.22, after the review patches and `a0c01dc`):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 4235/4235 passed, coverage 100% on `lib/server`, `lib/api`, `lib/shared`.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: the first run was slow (4.4 min, 8 flaky in unrelated specs: launch, combobox and inputs axe, primitives). A rerun gave 495 passed, 5 skipped, 2 flaky: the known `primitives.spec.ts` DisabledAction tooltip, as in 2.1 and 2.2.

## Spec Change Log

- **2026-10-16, review pass 1, human renegotiation:**
  - **Trigger:** the replace design ("upload, then the ownership-checked delete of the old id") could never delete the old file, because the named op owned only the newest Signature (blind hunter, verification gap).
  - **Amended:** the Decisions line "Old-file ownership". The fix is the foundation commit above; the story code is kept and patched rather than reverted, since only the delete's ownership source was wrong.
  - **Known-bad state avoided:** an orphaned private Signature file on every replace, and Remove failing after 5 replaces.
  - **KEEP:** upload forced to `me`; the version entry removed; ids only from `myself`; best-effort old delete; the remove loop.

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | B, VG | A replace can never delete the old file: the named op owns only `myself.signature` (the newest), so the old id is 404 `NO_FILE`, swallowed as best effort; every mock answered 204 | high | Verified at `file-delete.ts:45-54`. The human chose the foundation fix → `3d40ac1` (cherry-picked as `a0c01dc`; Spec Change Log) + **patch**: ownership-aware delete mocks and a replace test. |
| 2 | B, E | A replace reports success when the re-read still shows the old id | medium | Real: `uploadStep` returned OK → **patch**: fail the step. |
| 3 | B | `describeError` turns a network failure in the Signature step into the signature copy | low | Real: `describeError ?? fallback` → **patch**: `undefined` for `network`. |
| 4 | B | The `signature` token regex reuses `signatureSaveFailed` as a validation message, with no error wiring on the row | low | Real, though unreachable by UI → **patch**: plain `z.string()`. |
| 5 | E, B | An upload still re-encoding can land after Clear, a newer pick or unmount (stale pad memory) | medium | Real: `accept()` had no sequence or alive guard → **patch**. |
| 6 | B | The upload error stays after a valid drawing | low | Real → **patch**: clear on the first stroke. |
| 7 | B | Uploads are re-encoded twice | low | Real (`accept` + `signaturePng`) → **patch**. |
| 8 | E | A removal whose first delete is 404 (already gone) is reported failed | low | Real → **patch**: 404 `NO_FILE` counts as deleted. |
| 9 | B | The confirm cleanup effect runs on every change, not only on unmount as its comment says | low | Real (harmless only because a Promise resolves once) → **patch**. |
| 10 | VG | The pad's read-only state during a save is untested through the Section | medium | Real regression gap → **patch**: a test. |
| 11 | B, E | Stale docs (Section doc block); `savePersonalInformation` has no caller | low | Real → **patch**: docs and the dead export. |
| 12 | B | The 1 MB limit is defined twice with nothing tying them | low | Real drift risk → **patch**: both tests pin 1 MiB. |
| 13 | B | No e2e runs the real re-encode for a JPEG | low | Real gap → **patch**. |
| 14 | B | The FOUNDATION.md integrator follow-up is untracked | low | Real → **patch**: Foundation entry in deferred-work. |
| 15 | B | The e2e delete fixture sends `NO_FILE` for every non-204 status | low | Real → **patch** (with row 1). |
| 16 | B | A failed removal reads "Couldn't save your signature." | low | The AC gives one step-failure copy; the confirm already named the action → rejected. |
| 17 | B | Save during a slow re-encode proceeds without the new file | low | The window is the re-encode time of one image, and row 5 keeps stale results out; a pending state needs new UI → rejected. |
| 18 | B | The canvas name doesn't reflect whether a Signature is present | low | The AC fixes the name "Draw your signature"; keyboard users are pointed to Upload → rejected. |
| 19 | B | Export resolution depends on `devicePixelRatio` | low | `reencodeImage` caps at 960×320; 1× desktops export 480×160, enough for a signature → rejected. |
| 20 | E | The pad keeps a saved image that changes mid-edit (another tab) | low | Needs a concurrent change of the same Signature during this edit → rejected (unlikely). |
| 21 | E | A session failure after a successful upload fails the step | low | The session ends anyway; the next launch shows the new Signature → rejected. |
| 22 | E | An export right after a 768 px remount may miss the image layer | low | Needs Save within the image load after a rotation → rejected (unlikely). |
| 23 | E | `fileNewVersion` in the proxy upload union is now unused | low | Shared unions are add-only (T2); harmless → rejected. |
| 24 | E | A failed non-session re-read skips the old delete | low | The spec's best-effort rule (1.10); row 2 covers the "still old" case → rejected. |
| 25 | E | A stale re-read after a delete repeats the delete | low | Backend reads after writes are consistent; row 8 makes a repeat harmless → rejected. |
| 26 | B | The Verification section holds a local Node path | false | This machine's Node 24 for the build agent (as 2.1–2.3). |

## Design Notes

- **"Added {date}" / "Saved {date}":** no file date exists (`myself.signature` is `{id, name}`, and there is no file metadata endpoint), so both are omitted as the AC allows. The UJ-3 e2e asserts the thumbnail without a date. The backend could add `created` to the `myself` signature query cheaply; that would be a backend follow-up.
- **Leftover relations:** a second upload adds a relation without removing the old one, so a failed old-file delete leaves an older Signature behind. `myself` shows the newest, and Remove keeps deleting until none is left, so a removal never reveals an older Signature.
- **S3:** a hard delete may leave private S3 objects (deferred-work backend follow-up, unchanged).

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; `corepack pnpm` if `pnpm` isn't on `PATH`; no git commits, no push; never `CI=1` e2e without a fresh build):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
