# Epics validation — Profile module (step 4, sections 1–5)

Date: 2026-10-13 · Scope: Epics 7–10 (FR101–FR120, PNFR1–12, UX-DR-P1–P34, Profile Additional Requirements) and the 26 amended Epic 1–5 stories · Target: `epics.md`

| # | Check | Status | Notes |
|---|---|---|---|
| 1a | FR101–FR120 each in ≥1 Epic 7–10 story with full ACs | PASS | Every explicit FR consequence was traced to an AC (e.g. FR107 "Primary phone is required", FR109 rebase and no email re-send, FR111 "Totp is already enabled", FR114 empty-field first page, FR117 null-org drop, FR119 empty rule, FR120 no switch-tenant). |
| 1b | UX-DR-P1–P34 covered | FIXED | All 34 are cited. `qr-surface` (P1) was used but no story created it. Story 8.2 now adds it. |
| 1c | PNFR1–12 covered | PASS | PNFR7 (release date and freeze) is a process constraint with no story. PNFR8 was added to 7.5's Covers line. |
| 1d | Profile Additional Requirements covered | FIXED | AD-8 was missing from Covers (now on 7.1). The AD-15 debug-logger redaction of `qrCode`/`code` had no creating AC (now in 8.2). The spine's `features/account-page/` → `features/account/` path fix is listed under section 3. |
| 2 | Architecture: create things only when first needed | FIXED | Story 7.1 used to add every Profile allowlist entry up front, which duplicated 8.2, 8.3, 9.1, 9.2 and 10.1 and contradicted AD-2 ("each entry lands in the story that first uses it"). 7.1 now keeps only the denies and the kill switch, plus a `profile: true` tag (after the 2026-10-13 split these live in Story 7.2). The time-zone and locale entries and the `/edit` locale rejection moved to 7.5, and the `/edit` primary fields to 7.6. MFA, NPI and org entries are tagged in their own stories. `time-zones.ts` moved from 7.1 to 7.4, where it is first used. |
| 3 | Story quality: no forward or cross-epic dependencies | FIXED | Epic 7 depended on Epic 3 (the "Story 3.1" phone formatter and region parsing) and on Epic 2 (`person-rules.ts` owner unclear). Epics 9 and 10 depended on Epic 2 (the file-download `asImage` entry) and Epic 3 (`safeHref`). Epic 7 had no owner for `lib/api/myself.ts` or `info-icon-button`. The `isTenantMember` wording pointed at Epic 7, which never adds it. There was no reciprocal `info-popover` clause in 10.2. All are now resolved with first-lander-creates wording or explicit creation (see the fixes list below). |
| 3b | Story size | RESOLVED | Story 7.1 was very large. Split 2026-10-13 into 7.1 (route, tabs, deep links, states) and 7.2 (denies, kill switch, headers, mobile, a11y); old 7.2–7.5 renumbered to 7.3–7.6. |
| 4 | Epic structure and file churn | PASS (note) | Epics 7–10 are user-valued. They all touch `proxy-allowlist.ts` and `messages.ts`, which is incidental, append-only churn. Story 1.8 and Story 7.1 both specify the app-bar page nav, so 7.1 is now worded as verification of the 1.8 nav. |
| 5 | Dependencies | FIXED / RESOLVED | After the fixes, Epics 8–10 depend only on 1 and 7, and the within-epic order holds (9.1 → 9.2 → 9.3 uses a minimal registered body; 10.1 → 10.2 → 10.3 enriches one card). Story 1.8 rendering the "Account" item before `/account` exists (Epic 7) was accepted 2026-10-13 (same release). |
| A | Amended Epic 1–5 stories vs spine | FIXED | The spine-related items in the amended stories are clean: no framed or iframe branches, cookie set to `SameSite=Lax` without `Partitioned`, `{errorCode, source:"proxy"}` bodies, absolute `seeOther()` redirects, per-type contact-point keys, and "four" confirms. `{code:"UNEXPECTED"/"CANCELLED"}` appears only in the registry `save()` result, not in HTTP bodies, so it is fine. One stale leftover was fixed: the 3.7 amendment line still said "needs a decision", which PA1 has since resolved. |

## Fixes made in epics.md
- In the Epic 7 summary and header, "Profile allowlist entries and denies" now reads "Profile denies and the `ACCOUNT_DISABLED` kill switch, with each entry added per story".
- Story 7.1: the allowlist AC is cut down to the denies, the deny and traversal rows, and the `profile: true` tag. The kill switch now applies to tagged entries. The `time-zones.ts` AC was removed.
- Story 7.1: `navigate()` and the lint rule are now worded as extending Stories 1.7, 1.8 and 1.1. The app-bar AC is now worded as verifying the Story 1.8 nav. AD-8 was added to Covers.
- Story 7.4: creates `lib/shared/time-zones.ts` and `lib/api/myself.ts`, and creates or shares `formatPhoneDisplay()` with Story 3.1.
- Story 7.5: adds the time-zone and locale allowlist entries and the `/edit` locale rejection, with test rows. Adds the name rules to `person-rules.ts` if missing. Creates `components/ui/info-icon-button.tsx`.
- Story 7.6: the `/edit` schema accepts `email`, `phoneNumber` and `phoneNumberRegion`. The region now comes from the Story 1.9 row (was "Story 3.1"). Phones are formatted with `formatPhoneDisplay()`.
- Story 8.1: adds `totpEnabled` and `mfaEnabled` to `myself.ts`.
- Story 8.2: tags its entry; adds the `qr-surface` token and the `qrCode`/`code` logger redaction.
- Story 8.3: tags its entry.
- Story 9.1: tags its entries and reuses `info-icon-button`.
- Story 9.2: tags its entries.
- Story 9.3: adds `isTenantMember`, `tenants` and `signature` to `myself.ts`. Adds the file-download entry only if Story 2.1 hasn't landed. Creates or shares `safe-href.ts` (`https:`/`mailto:`/`tel:`). The support email goes through `safeHref()`.
- Story 10.1: tags its entry.
- Story 10.2: adds the reciprocal `info-popover` clause, creates or shares `safeHref`, and reuses `info-icon-button`.
- Stories 2.1, 2.2, 3.1 and 3.7: reciprocal first-lander wording for the file entry, `person-rules.ts`, `formatPhoneDisplay()` and `safe-href.ts`.
- `features/account-page/*` was renamed to `features/account/*` to match the spine layout.

## RESOLVED (human decisions, 2026-10-13)
1. RESOLVED: Story 1.8's "Account" app-bar item may point to `/account` before Epic 7 lands. Accepted as is, since both ship in one release; a note was added to Story 1.8.
2. RESOLVED: Story 7.1 was split into 7.1 "Account page — route, tabs, deep links and states" and 7.2 "Account page hardening — denies, kill switch, headers, mobile and accessibility" (7.2 depends only on 7.1). Every AC was moved without loss. The old 7.2–7.5 are now 7.3–7.6, and all cross-references in `epics.md` and this file were updated.
3. RESOLVED: Story 9.1's Register button stays inert until 9.2. Accepted, since both ship in one release; a note was added to Story 9.1.
4. RESOLVED: Story 7.3's `TENANT_HANDOFF_SHAPE` default of `"root"` is confirmed. Tenant hand-off goes to the `PORTAL_URL` root until OQ1 is answered, and switching to `?ctx=<tenantId>` changes one constant. Story 7.3 now states this as decided.
