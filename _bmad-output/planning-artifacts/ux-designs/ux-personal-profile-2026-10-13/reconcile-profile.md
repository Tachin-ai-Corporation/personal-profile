---
title: "Reconcile: Profile module (/account) spines vs inputs"
created: 2026-10-13
scope: EXPERIENCE.md + DESIGN.md Profile-module content vs PRD prd-profile-account-2026-10-13 (prd.md, addendum.md §D), imports/profile-current-ui/{1,3,4,5}.png, .memlog.md (from "Update intent"), and mockups key-account / key-provider-registration / key-organizations
note: Read-only reconciliation. Spines and mocks were not modified. Severity: High = parity/QA failure or wrong copy likely to ship; Medium = ambiguity an implementer will resolve differently from the PRD; Low = polish, consistency, or documentation.
---

# Reconcile: Profile module (/account)

## Summary (top gaps)

| # | Sev | Gap | Input |
|---|---|---|---|
| 1 | High | The Account settings validation copy is missing or wrong. The age message differs from §D, and the Proctor 21–120 variant is absent | PRD FR-105/FR-108, addendum §D |
| 2 | High | Primary phone picker: the spine never says Verified **Landlines** are listed, and the Contacts rule "Landlines can't be primary" invites filtering them out | PRD FR-107, §E row 4 |
| 3 | Medium | The NPI search error copy is "Couldn't load results · Retry". §D says "Couldn't load results. Try again." | addendum §D, FR-114 |
| 4 | Medium | The info popover opens on focus + Enter. The PRD says it opens on hover, focus or click | FR-116, FR-118 |
| 5 | Medium | Org card is missing short-name fallback, type-icon order and tooltip labels ("Healthcare", n/a text); the mock labels them "Health Provider" | FR-118, addendum §B |
| 6 | Medium | The condition for "Register your practice" CTA drops "Practice NPI verified" | FR-116 |
| 7 | Medium | QR alt text, `autocomplete="one-time-code"` and numeric input are missing. On mobile the PRD requires full-screen sheets, but the spine has a gutter dialog | FR-111, NFR Responsive/A11y |
| 8 | Medium | The labels conflict. The Voice table uses long labels, while DESIGN and the mock use short ones. The NPI labels lose today's "(hospital, clinic, lab, etc.)" cue | FR-104, FR-114, screenshots 1/4, PM1 |

---

## 1. PRD (prd.md) and addendum

### 1a. Copy table (addendum §D), where strings must match

| # | Sev | Input says | Spine says / omits | Suggested fix |
|---|---|---|---|---|
| C1 | High | Age rule: "You must be between 18 and 120 years old" / "You must be between 21 and 120 years old" (Proctor) | Voice "Validation" row: "You must be 18 to 120 years old" (the PP wording). There is no 21 variant, and the spines never mention Proctor | Add an "Account settings: validation" Voice row with both §D strings. In the Account settings Component row, add "age 18–120, or 21–120 with the Proctor role; the date picker's range enforces the same rule" |
| C2 | High | "First name is required" / "Last name is required"; "First name can be up to 24 characters" (same for last); "Birth date is required"; "Enter a date as MM/DD/YYYY" | Absent. The spines also omit the 1–24 characters-after-trim rule | Add these strings to the same Voice row and the rule to the Component row |
| C3 | Medium | "Primary phone is required" | Absent | Add it, for the case where the user has no Primary phone |
| C4 | Medium | "Select a preferred language", "Select a time zone", "Select a locale" (field errors) | Only the "Select a value" placeholder is given. No error text | Add them as the field errors shown when a blank value blocks Save |
| C5 | Medium | NPI search failed: "Couldn't load results. Try again." | Voice, DESIGN and State Patterns all use "Couldn't load results · Retry" | Use the §D string. Retry can stay as the row's action, with "Try again." as the text |
| C6 | Low | MFA title: today it is "Enable authenticator app for MFA". FR-110 says "Authenticator app enabled" with a check | The Section is titled "Authenticator app" and the status reads "Enabled" (PM5) | These changes are approved (PM1/PM5) but aren't in §D. Ask the PM to add them to the §D copy table so QA parity (§E row 7) doesn't flag them |
| C7 | Low | Glossary/FR-104 Section: "Personal Account Settings" | "Account settings" | Same as C6: record it as a D3 copy delta |
| C8 | Low | Save success: "Personal account updated successfully" | Correct in Voice, but State Patterns "Saved" still gives the generic toast "{Section} saved." | Add "(Account settings: 'Personal account updated successfully')" to the Saved row |
| — | OK | Partial save, no changes, load error, MFA short/wrong/linked/disabled/base-off, NPI required/taken/register success/error, org disabled, no access | Match §D verbatim | — |

### 1b. Functional requirements with a UX surface

| # | Sev | Input says | Spine says / omits | Suggested fix |
|---|---|---|---|---|
| F1 | High | FR-107: the phone picker lists Verified Mobile **and Landline** entries (parity; §E row 4 "including a landline") | "Selects listing Verified entries". Contacts Voice says "Landlines can't be primary", so implementers will likely filter landlines out | State in the Account settings row: "Phone picker lists Verified Mobile and Landline entries (deliberately unlike Contacts)" |
| F2 | Medium | FR-107: the current Primary is always selected and "doesn't count toward the disabled rule" | "with no other option the Select is aria-disabled" | Add "the current Primary, verified or not, doesn't count as an option", and define option display (value + Contact Label?) |
| F3 | Medium | FR-108: an unlisted stored value "is shown by its label when known, otherwise as the raw code" | "an unlisted stored value shows its code" | Use the label when known and fall back to the code |
| F4 | Medium | FR-105: Birth date control is a MM/DD/YYYY date with a picker whose range enforces the age rule. Its help is a "?" in edit mode | The spines don't specify the control. DESIGN's Key/value table only says "carries age-rule help". The mock shows the help as always-visible text plus a calendar icon | Specify a masked MM/DD/YYYY input with a calendar picker limited to the min/max dates. Choose either a "?" Tooltip or always-visible help, and record it as a PM choice |
| F5 | Medium | FR-111: QR alt text is "QR code to link your authenticator app"; the input is a single labeled 6-digit numeric field with `autocomplete="one-time-code"` | The spines don't mention alt text, `inputmode="numeric"`, `autocomplete`, maxlength or digits-only | Add these to the Link authenticator dialog row (EXPERIENCE) and to otp-input (DESIGN) |
| F6 | Medium | FR-116: "Register your practice to enable ordering" shows only when the Practice NPI is **verified** and not yet claimed | PM6: "practice not claimed". It omits the verified condition | Add "verified and" to PM6 and the DESIGN row |
| F7 | Medium | FR-116: Practice Name shows the support contact **only when the practice is a 1health Organization** | DESIGN: Practice name is always a link-styled button that opens a popover | When the practice isn't an Organization, Practice name is plain text with no popover |
| F8 | Medium | FR-116/FR-118: the popover opens "on hover or focus" and "on hover, focus or click" | Info popover: click/tap, **keyboard focus + Enter**, and hover after 150 ms | Either align with the PRD (open on focus) or record the change as an a11y-driven deviation and get PM sign-off. Opening on focus alone conflicts with Tab navigation through cards, so the PRD may need the edit |
| F9 | Medium | FR-118: the card shows the **short name, falling back to the name** | It says "Name" | State "short name → name fallback; full name in Tooltip" |
| F10 | Medium | FR-118: icon order is Lab, Health Provider, Supplier, Go To Market, then the rest alphabetically. The +N chip's **tooltip and accessible name** list the remaining types | The order isn't stated (DESIGN's lucide list happens to start in that order). PM9 covers only the tooltip | Add the sort rule, and make the chip's accessible name list the hidden types |
| F11 | Medium | Addendum §B: the type label for Health Provider is "**Healthcare**", and n/a reads "No types selected for this organization" | The lucide map gives icons but no tooltip labels | Add a Type → icon → tooltip label table (DESIGN Organization card). It resolves OQ4 more completely |
| F12 | Medium | FR-119: for internal users (`@1health.io`, `@tachin.ai`) the empty-state action is a Portal hand-off to organization creation, not the checkout site | The DESIGN row mentions the checkout icon. EXPERIENCE doesn't give the internal-user variant of the empty state | Add it to State Patterns "No organizations", with the button label and the hand-off rules (same tab or new tab) |
| F13 | Low | FR-119: the four feature-row descriptions (addendum §B) | They're in the mock only, not in the Voice table | Add them to the Voice "My Organizations" row |
| F14 | Low | FR-119: the empty state uses `totalElements === 0` with no search text. With search text, the result is the No results state | The two states are listed but the rule isn't | Add a one-line rule in State Patterns |
| F15 | Low | FR-117: 12 cards per page | No page size given. The skeleton shows 8 cards | State 12 per page. The skeleton can stay at 8 |
| F16 | Medium | FR-102/AM-3: a launch that arrives in a non-default tenant shows the AD-6 error with module-neutral copy ("Profile is available in your personal account…") | There is no /account wrong-tenant state. The Invalid-launch copy says "Open Personal Profile again from 1health." | Add a "Wrong tenant" row to IA, State Patterns and Voice with the neutral copy |
| F17 | Medium | FR-109: on success, re-fetch the user and Contact Points. Name and Primary email/phone can change | The profile header refresh is defined only for Personal information saves (FR-9). On /account the header shows name, primary phone and primary email | State that the header updates after an Account settings save |
| F18 | Low | FR-114: the option format is a single string `"<NPI>, <First> <Last>, <City>, <State>"` (practice: with address line 1) | The options are two lines. The selected value is the full string | Keep the two-line visual, but give each option the full PRD string as its accessible name |
| F19 | Low | FR-114: an empty field shows the first page; there are 10 per page | Covered. There's no zero-results copy for an NPI search | Add a "No NPIs found" listbox row (draft copy) |
| F20 | Low | FR-115: the matching taken message appears per NPI | The placement for the practice-taken case isn't stated (the mock shows only personal) | Show each message at its own field |
| F21 | Low | FR-115: register error shows the platform message or the phone-number fallback | The surface (toast or inline) isn't stated | Choose one; an inline Section banner is suggested because the message contains a phone number |
| F22 | Low | FR-116: Signature "?" help with a link to Personal Profile → Personal Information | The copy and deep link are present. DESIGN doesn't specify the "?" affordance | Add a help icon + Tooltip spec, or always-visible help (as in the mock) |
| F23 | Low | FR-106: password is out of scope (OQ for the next release) | Help reads "Password changes aren't available here yet." The word "yet" promises a feature | PM to confirm, or drop "yet" |
| F24 | Low | FR-104: "Not provided" also covers a birth date that fails the age rule (today "Unknown") | PM3 is generic | Add an explicit note so it isn't missed |

### 1c. NFRs

| # | Sev | Input says | Spine says / omits | Suggested fix |
|---|---|---|---|---|
| N1 | Medium | "Dialogs become full-screen sheets on mobile" | QR dialog: "full width minus 16 px gutters". Confirm dialogs aren't specified | Make the Link dialog full-screen below 768 px, or record the deviation for PM sign-off. EXPERIENCE bans *bottom-sheet editors*, which may be why |
| N2 | Low | Security: "The QR image is dropped when the dialog closes"; never in logs or telemetry | "Never stored in drafts" | Add "QR discarded on close; not logged" |
| N3 | Low | A11y: tabs, comboboxes, popovers and dialogs keyboard-operable; icon-only controls named | Accessibility Floor has no /account entries. Its keyboard tab order lists "index", which /account doesn't have | Add an /account line: tab order app bar → header → tabs → Section(s). Also cover the combobox and OTP |
| N4 | Low | Responsive: org grid 1–4 columns, MFA tiles wrap, 360 px | It's in DESIGN only. The EXPERIENCE Responsive table has no /account row | Add a row |

### 1d. Deltas D1–D10

D1 (OK), D2 (OK), D3 (partial: C1–C5), D4 (OK), D5 (OK), D6 (partial: F9–F11), D7 (partial: F5), D8 (OK), D9 (partial: C5), D10 (partial: F16).

---

## 2. Screenshots of today's UI (imports/profile-current-ui)

| # | Sev | Today shows | Spine says / omits | Suggested fix |
|---|---|---|---|---|
| S1 | Medium | 4.png: the NPI fields read "Search for your personal NPI number *" and "Search for your practice's (hospital, clinic, lab, etc.) NPI Number". The PRD FR-114 and UJ-103 quote the same text | "Personal NPI number" / "Practice NPI number (optional)" + "Search by NPI or name". The "(hospital, clinic, lab, etc.)" cue that explains what a practice is gets lost | Keep the new labels (PM1), but add help text under Practice: "Your hospital, clinic, lab or other practice." Record the label change as a D3 delta |
| S2 | Medium | 1.png and 3.png: labels "Primary Email Address", "Preferred locale for date, time, and currency" | The spines contradict each other. The EXPERIENCE Voice table uses the long forms, while DESIGN and the mock use "Primary email", "Primary phone" and "Preferred locale" | Choose one. Per PM1 ("labels per Voice and Tone"), use the long forms and fix DESIGN and the mock |
| S3 | Low | 1.png: the read view shows 4 field pairs per row | PM2 shows 2 pairs per row (4 columns) | This is an approved deviation and needs no action. Note it for QA |
| S4 | Low | 1.png: primary phone shows unformatted `+14155512125` | The mock formats it as "+1 (415) 551-2125". The spines don't say how | State that the Primary phone uses the same display format as Contacts |
| S5 | Low | 5.png: the Health Provider icon is a shield with a plus | Health Provider → HeartPulse, Insurance → ShieldCheck. Returning users may read the shield as "healthcare" | Consider a non-shield icon for Insurance (e.g. `Umbrella`), or accept it and note it under OQ4 |
| S6 | Low | 5.png: pagination is shown even with a single page ("< 1 >") | "always shown when there are results" (OK). With one page, both arrows are aria-disabled | Note the single-page case in PM10 |
| S7 | Low | 3.png: Cancel/Save in the header; asterisks on required fields | They're in the footer and required fields are unmarked (PM4, F2) | These are approved deviations. No action |
| S8 | Low | 1.png: blank language and time zone render as empty values | They show "Not provided" (D8) | OK. Use this account as the QA fixture |

---

## 3. Memlog decisions (from "Update intent" onward)

| # | Sev | Memlog says | Spine says / omits | Suggested fix |
|---|---|---|---|---|
| M1 | Low | "confirm dialogs now four" | Stale "three" remains: EXPERIENCE Profile header ("not one of the three data confirms"), Save all bar ("confirm-only-three rule"), Leave guard ("three data confirms"). The DESIGN Confirm dialog row lists the button styles for three confirms only | Change these to "four", and add "turning off the authenticator → destructive" to the DESIGN Confirm dialog row |
| M2 | Medium | PM1: "labels per Voice and Tone" | DESIGN Account settings row and the mock use the short labels | See S2 |
| M3 | Low | "/account shell = same app bar + profile header" | It isn't stated whether the avatar's Change profile picture works on /account | State that it works there too, as an in-place dialog |
| M4 | Low | "Spines extended … EXPERIENCE … voice rows, component/state patterns" | The Foundation "Vocabulary" line and the "Known conflicts resolved here" list don't cover the Profile glossary or the Profile mock deviations | Add the Profile glossary terms (Primary Email, Authenticator App, NPI, Organization, Portal hand-off) and the mock deviations below |
| M5 | Low | PM10: "popovers open below their trigger" | It's in the spine, but see mock deviation K5 | — |
| M6 | OK | Card grid 4/3/2/1; key/value reuse; no switcher; in-app links; PM1–PM11 recorded; mocks linked from both spines | Present | — |

---

## 4. Mock deviations (the spines win: fix the mock or note it)

### key-account.html
| # | Sev | Mock | Spine | Fix |
|---|---|---|---|---|
| K1 | Medium | Labels "Primary email", "Primary phone", "Preferred locale" | The Voice labels are the long forms | Fix the mock after S2 is decided |
| K2 | Low | QR `aria-label` "QR code for the Microsoft authenticator app" | PRD: "QR code to link your authenticator app" | Fix the mock |
| K3 | Low | The OTP placeholder "Enter the 6-digit code" is the same text as the short-code error | — | Use no placeholder, or "000000", so the error and the hint aren't confused |
| K4 | Low | The section header shows an "Editing" tag | It isn't in the spine | Remove it, or add it to the spine |
| — | Low | No frames for the base-MFA-off banner, the Disable confirm, partial-save failure or QR loading | They're specified in the spines | These frames are optional. Note their absence in the mock |

### key-provider-registration.html
| # | Sev | Mock | Spine | Fix |
|---|---|---|---|---|
| K5 | Low | The (i) popover opens to the right, and the Practice name popover opens above | PM10: popovers open below the trigger | Fix the mock, or note "flip when no room below" in PM10 |
| K6 | Low | The annotation "[ASSUMPTION] copy · PM to approve" on the (i) popover | The memlog says the Provider (i) copy is approved | Remove the stale annotation |
| K7 | Low | The registered view is 4-column and row-major (N2) | DESIGN says only "key/value table in FR-116 order" | Add "4-column, row-major like Account settings" to DESIGN |
| K8 | Low | Practice NPI value is "NPI: 1871604392" under the label "Practice NPI" | PM7 | Drop the redundant "NPI:" prefix, or note it as parity with FR-116 |

### key-organizations.html
| # | Sev | Mock | Spine | Fix |
|---|---|---|---|---|
| K9 | Medium | Frame D is labeled "framed" but shows "Return to 1health" in the app bar | PM11 / AD-5: hidden when framed | Hide it in frame D |
| K10 | Medium | Type tooltips use native `title`, which isn't focusable or tappable | The Tooltip opens on hover, focus and tap | Use the Tooltip component. Icons need to be focusable (32 px target per `type-icon`) |
| K11 | Medium | The type tooltip reads "Health Provider" | §B label: "Healthcare" | Fix after F11 |
| K12 | Low | On mobile, the "+2" chip has no tooltip or accessible name | F10 | Add one |
| K13 | Low | The full-name tooltip is a native `title` | The spine requires a Tooltip | Fix the mock |
| K14 | Low | The empty state (frame B) has no search field and no internal-user variant | F12 | Add an internal-user note or frame |
