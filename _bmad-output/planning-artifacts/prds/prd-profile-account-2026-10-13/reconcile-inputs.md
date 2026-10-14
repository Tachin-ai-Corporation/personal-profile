# Input reconciliation: Profile module PRD (NG-9019)

- Date: 2026-10-13
- Compared: `prd.md` + `addendum.md` against `research-1health-fe.md`, `research-backend.md`, `research-api-docs.md`, the four UI screenshots (1, 3, 4, 5) and `.memlog.md`.
- Baseline: 1:1 parity plus small UX deltas; change password is out.
- Severity: **H** = changes behavior or contradicts the evidence; **M** = parity or copy drift that QA will catch; **L** = polish or wording.
- `prd.md` was not modified.

---

## 1. research-1health-fe.md (today's `/personal-settings`)

### 1.1 [H] MFA: the app now turns on base MFA, which today's screen never does
- **Input:** 1health-fe only calls `POST mfa/enable/totp`. It never calls `mfa/enable` and assumes `mfaEnabled` is already true (§1.5). research-api-docs §6.3 says it is unclear whether `mfa/enable` changes login behavior (email/SMS codes) as a side effect.
- **PRD:** FR-111 says "If base MFA is not enabled yet, the app enables it first … The user sees one flow." FR-112 then leaves base MFA on after Disable. A user who never had MFA would end up with email/SMS MFA at login, permanently and without being told. This isn't parity, and it isn't in the approved deltas.
- **Fix:** do one of the following:
  - Match today: when `!mfaEnabled`, call `enable/totp` and show the platform error.
  - Or keep the new behavior, but log it as an approved delta. Add a consequence that tells the user email/SMS codes will also be turned on, and add an open question on the login side effect.

### 1.2 [H] The current primary email or phone must stay in the picker even when it isn't verified
- **Input:** `addIfNotThere` appends the current `user.email` or `user.phoneNumber` with `id=-1` when it isn't among the verified options (§1.1).
- **PRD:** FR-107 says "Each picker lists only Verified Contact Points". It doesn't say what happens to an unverified current primary. As written, the field could render blank and fail its required check.
- **Fix:** add a consequence. The current Primary always shows as the selected value even if it isn't Verified. It is never sent unless the user changes it, and it doesn't count toward the "one option or none → disabled" rule.

### 1.3 [M] No load-error state for Personal Account
- **Input:** a load failure shows the toast "Something went wrong while loading profile information" (§1.1).
- **PRD:** FR-103 covers only 403 and skeletons. FR-104 doesn't say what happens when `myself` or `contact-point/list` fails, other than with a 403.
- **Fix:** add to FR-104 or FR-103: on a non-403 load error, show today's message (as an inline error with Retry, or as a toast) and never show an empty form.

### 1.4 [M] Copy rewrites go further than "typo fixes"
- **Input:** today's strings include:
  - "{app} Authenticator is linked successfully"
  - "Invalid Code. Try again." (toast)
  - "Please enter the code"
  - "Successfully disabled"
  - "Provider Npi is successfully registered"
  - "Your Provider Npi and Practice NPi are registered successfully!"
  - "Npi is already registered try to look again your own"
  - "The practice Npi is already registered try to look again"
  - "Personal Npi field is required field"
  - "There are no changes!"
  - "No signature available!"
- **PRD:** FR-111, FR-112 and FR-115 rewrite these, for example "{App} authenticator linked", "Enter the 6-digit code", "Authenticator app disabled", "Provider NPI registered", "Check that you selected your own." It also adds new strings: "Authenticator app enabled", "Disable the current authenticator to link another", "You're disabled in this organization", "Couldn't load results. Try again." The memlog approves only "typo fixes", and the NFR says "Today's strings are kept except where an FR says they are corrected". So the FRs approve their own rewrites.
- **Fix:** add an old → new copy table to the addendum (§D) so the PM can approve it in one pass. Keep today's wording wherever only the casing or grammar is wrong.

### 1.5 [M] Today the "wrong code" and "fewer than 6 digits" feedback is a toast, not inline
- **Input:** both are toasts, and the OTP input clears on a wrong code (§1.5).
- **PRD:** FR-111 makes both messages inline in the dialog. That is a reasonable delta, but it isn't listed in §1 or §6.1.
- **Fix:** list "inline MFA errors" among the deltas, or keep toasts.

### 1.6 [M] Order of the registered-view fields
- **Input:** NPI, Taxonomy, Health Information Exchange, Practice Name, practice address, "NPI:<orgNpi>", Licenses, Address of practice (lines 1–2), Signature (§2.4).
- **PRD:** FR-116 lists NPI, Taxonomy, Licenses, Address of practice, HIE, Practice Name, practice address, practice NPI, Signature. It also drops the "NPI:" prefix format.
- **Fix:** state today's order for 1:1 parity, or mark the new order as a UX decision.

### 1.7 [M] How the "Register your practice" CTA is resolved is missing
- **Input:** the view first looks up the practice record id with `public/npi/list?entityTypeCode=2&searchText=<orgNpi>`, then calls `is-registered` on that id. It shows the CTA when `isVerified && organizationNpi && !is-registered` (§2.4).
- **PRD and addendum:** FR-116 states the rule. Addendum §A maps FR-116 to `is-registered` but leaves out the lookup step. `GET user/npi` already returns `practiceNpi.id`, so the lookup may not be needed at all.
- **Fix:** in the addendum, say which id to use. Prefer `practiceNpi.id` from `user/npi`, and fall back to today's lookup.

### 1.8 [L] Birth Date "?" shows only in edit mode
- **Input:** the "?" is shown in edit mode only (§1.3). Screenshot 3 shows it before the label.
- **PRD:** FR-105 doesn't say which mode.
- **Fix:** say "edit mode" or deliberately extend it to the read view.

### 1.9 [L] Validation on blur for NPI
- **Input:** "Personal NPI is required" fires on blur or on submit.
- **PRD:** FR-115 has it fire only on Register.
- **Fix:** add "on blur and on Register".

### 1.10 [L] Organization type icon order
- **Input:** types are sorted alphabetically (`toSorted()`) before rendering (§3.2).
- **PRD:** FR-118 doesn't say what order they're in, which matters now that only the first N show before "+N".
- **Fix:** specify the order. Note that screenshot 5 shows Lab, Health Provider, Supplier, Go To Market, which is not alphabetical; see 3.1.

### 1.11 [L] Organization card name source
- **Input:** the card shows `shortOrganizationName` (§3.2). Screenshot 5 shows "gotomarket2 shorty" and "DNN Healthcare Sh…".
- **PRD:** FR-118 just says "the name". The addendum lists both `name` and `shortOrganizationName`.
- **Fix:** add "short name (`shortOrganizationName`), falling back to `name`" to FR-118.

---

## 2. research-backend.md and research-api-docs.md

### 2.1 [M] Required time zone or language when the stored value is null or unlisted
- **Input (backend):** time zone and language are free-form per user, and there are no option endpoints. Screenshots 1 and 3 show that the real account has a blank Preferred Language and Default Time Zone, in the view and in the edit form.
- **PRD:** FR-108 says "All three are required". It also says an unlisted value "is never shown blank, and saving doesn't change it". It doesn't say whether a null or unlisted stored value **blocks Save**. Today it does: the user has to pick a value to save anything, even just a name change.
- **Fix:** state the rule explicitly. Either an unlisted non-null value passes the required check, with null still forcing a pick (today), or required applies only when the field is dirty.

### 2.2 [M] MFA errors can arrive as 500, not only 400
- **Input:** research-api-docs §2 and §3 say `enable/totp` throws `IllegalStateException`, which "likely surfaces as 500". Their advice is to treat 400 and 500 as user-visible failures with `message`. research-backend says Feign maps them to 400.
- **PRD and addendum:** "Show `message`; branch only on HTTP status." There is no rule for 5xx bodies that carry a message.
- **Fix:** in the addendum's error rule, show `message` for any 4xx or 5xx that has one, and the generic error otherwise.

### 2.3 [L] `birthDate` is null until terms are accepted, and `myself` can return 400 for a pending join request
- **Input:** `birthDate` is null when the user hasn't accepted terms in the current tenant. `myself` returns 400 "Login restricted…" while a join request is pending.
- **PRD:** FR-104 says only "Unknown" or "Not provided".
- **Fix:** add the null-birth-date case to FR-104 as "Not provided" (it is still required on Save). The pending-join 400 can go to the shared shell (PP).

### 2.4 [L] `phoneNumberRegion` constraint
- **Input:** the region must be lowercase (`us`), defaults to US, and is sent with `phoneNumber`.
- **Addendum:** lists `phoneNumberRegion` but doesn't give the rule.
- **Fix:** add "lowercase ISO-3166 alpha-2, taken from the contact point's `phoneNumberRegion`" to the addendum.

### 2.5 [L] `organization/portal` with an empty `name`
- **Input:** 1health-fe sends `name` trimmed and lowercased.
- **PRD:** FR-117 says "case-insensitive" but doesn't say to trim. That is minor, but it affects the empty-state rule ("no search text").
- **Fix:** add "trimmed" to FR-117.

---

## 3. Screenshots

### 3.1 [H] The "+N" overflow already exists in the live UI, with 4 icons before the chip
- **Input:** screenshot 5 shows "1health" with 4 type icons (lab, shield, truck, storefront) and then a "+2" chip. The research (commit `b44d7aedf`) says there is no overflow and that all types render. So the deployed UI is newer than the researched code, or the research is wrong.
- **PRD:** FR-118 says "at most **3**, followed by a '+N' chip … (new; today all types render)". The memlog lists "+N overflow" as a delta. Both the threshold and the "new" claim contradict the screenshot.
- **Fix:** re-check `OrganizationCard.tsx` on 1health-fe main. Set the cap to 4 for parity, and drop "+N" from the delta list if it already exists. Record today's icon order (see 1.10).

### 3.2 [M] Pagination shows even when there's only one page
- **Input:** screenshot 5 shows the pager ("‹ 1 ›") with 3 results. The research also says it "shows only when there are results".
- **PRD:** FR-117 says "pagination below the grid when there is more than one page", which is a silent change.
- **Fix:** keep today's rule (show it whenever there are results) or list the change as a delta.

### 3.3 [M] Organization cards with no logo leave an empty area today
- **Input:** screenshot 5 shows DNN Healthcare and gotomarket2 with a blank logo area, which the research confirms (no fallback).
- **PRD:** FR-118 adds an "initials on a neutral tile" fallback but doesn't mark it as new. It isn't among the approved deltas in the memlog.
- **Fix:** mark it "(new)" and add it to §1, §6.1 and the memlog, or keep the blank area.

### 3.4 [M] The PRD is silent on the user menu and header chrome
- **Input:** screenshot 1 shows the header with the 1health logo and a "Daniel Garcia · PERSONAL" context chip. The user menu shows the name and email, then Profile, Provider registration, My organizations, Privacy, Terms, a Dark mode toggle, Sign out, and the footer "Session active · refreshes in 1 hour".
- **PRD:** FR-102 mentions only the three menu items, as launch points in 1health-fe. It doesn't say whether the app shows its own header and user menu, or relies on the portal chrome. It doesn't cover Privacy, Terms, Sign out, the session indicator, or dark mode. CLAUDE.md says dark mode is off by default.
- **Fix:** add one line to FR-101 or §5. Either the shell (PP-FR-n) owns the header and user menu, or the module shows no header. Say explicitly whether Dark mode applies to this module.

### 3.5 [L] Layout cues the PRD doesn't record
- **Input (screenshots 1 and 3):**
  - Personal Account uses a 4-column grid in this order: First, Last, Username, Password / Primary Email, Primary Phone, Birth Date, Preferred Language / Default Time Zone, Locale. In edit mode the locale spans 2 columns.
  - Edit mode puts "× Cancel" and "Save" (with icons) at the top right of the card header.
  - The disabled email and phone pickers show their helper text in a warning (amber) color, with an underlined "personal profile" link.
  - The view shows the password as `********`, and edit mode shows `**********`.
- **Input (screenshot 4):**
  - The Register button is right-aligned, in the brand (gold) color.
  - The (i) is at the top right of the card header.
  - The fields are full width.
- **Input (screenshot 5):**
  - The search field sits on its own white card with a trailing search icon.
  - Cards are about 300 px square, with the (i) at the top right, the logo area at the top, the bold name, a row of icons, and a gold "Enter portal" pill.
- **PRD:** these are deferred to the design system and UX.
- **Fix:** add a short "Layout parity" note to the addendum listing these, so UX keeps the field order and the column count at desktop width.

### 3.6 [L] "phones(s)" typo in the phone helper
- **Input:** screenshot 3 reads "Please add additional verified phones(s)…".
- **PRD:** FR-107 says "phone(s)", which is already corrected.
- **Fix:** none needed. Add it to the copy table (1.4) so QA expects the change.

### 3.7 [L] Empty values show blank today, not "Not provided"
- **Input:** screenshot 1 shows Preferred Language and Default Time Zone with an empty value.
- **PRD:** FR-104 shows "Not provided", which is a small delta it doesn't mark.
- **Fix:** mark it as new, or keep it blank.

---

## 4. .memlog.md (decisions log)

### 4.1 [H] The PRD's delta list is longer than the approved one
- **Input:** "(decision) Minor UX deltas approved: +N org-type overflow, real IPR (i) tooltip, Disable MFA confirmation, typo fixes".
- **PRD:** §6.1 also calls these "agreed":
  - the Register (NPI) confirmation
  - the first-change notice fix
  - skeletons, error and 403 states
- The body adds still more, with no mark:
  - base-MFA auto-enable (1.1)
  - inline MFA errors (1.5)
  - the tiles-inactive hint
  - the logo initials fallback (3.3)
  - the unknown-type fallback
  - the pagination change (3.2)
  - "Couldn't load results"
  - the Primary-contact click/Escape behavior
  - "Not provided" (3.7)
  - the signature help link
  - the disabled-reason text
- **Fix:** collect every delta into one table in §6.1, each with "approved in memlog: yes/no". Get sign-off on the "no" rows, then log them in the memlog.

### 4.2 [M] The memlog contradicts itself on password change
- **Input:** line 10 says "Scope: … incl. password change". Line 12 says "Password: 1:1 read-only masked field … change-password deferred".
- **PRD:** consistent with line 12. The memlog has no "(change)" entry saying line 10 is superseded.
- **Fix:** add a memlog entry: "(change) Scope revised: password change out (supersedes scope line)". The PRD itself is fine.

### 4.3 [L] Release label
- **Input:** the memlog says "Release: same as NG-9019 — 2026-10-29 (freeze 10-22, demo QA by 10-24)".
- **PRD:** adds "2026.07.01 'Conduit'", which isn't in the memlog. It is probably inherited from the PP PRD.
- **Fix:** confirm the release name, or drop it.

### 4.4 [L] Enter portal and the per-tenant URL (OQ1)
- **Input:** the memlog says the decision is "navigate top window"; the URL is still to be confirmed, with the candidate `?ctx=<tenantId>`.
- **PRD:** consistent (A4, OQ1).
- **Fix:** none. The PRD doesn't drop today's "disabled when it is the current tenant" rule; that rule never applies because the app always runs in the default tenant (A1).
