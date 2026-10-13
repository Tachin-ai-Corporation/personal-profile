# Reconciliation: legacy-UI screenshots vs PRD

Input: `docs/design/NG-9020..NG-9026*.png` (7 screenshots). Checked against `prd.md` and `addendum.md` for functional gaps only (visual redesign is intended).

## Findings (ordered by impact)

| # | Screenshot | Element | PRD location | Suggested fix |
|---|---|---|---|---|
| 1 | NG-9023 phone, NG-9024 email | "Type" dropdown whose value is **Primary**: legacy sets Primary by choosing the *label* "Primary" (Glossary §3 also lists Primary as an example Contact Label) | FR-18, FR-22 and Glossary ("Contact Label", "Primary") don't say how a user makes an entry Primary. The Glossary treats Primary as both a label and a separate flag. | State the mechanism explicitly: either (a) a "Make primary" action separate from the label (and drop Primary from the selectable labels), or (b) keep label = Primary as the trigger. Fix the Glossary to match. Note addendum §B: an entry can't be *added* as Primary. |
| 2 | NG-9022 (Birth Date), NG-9023 (Phone Number) | Help **(?)** icons next to required fields (they explain the age rule and the phone format/verification rule today) | missing. Vision §1 says "constraints explained before the user runs into them", but no FR requires contextual help or says what it contains | Add a consequence to FR-12 (birth date help: 18–120, or 21–120 for Proctor) and FR-16 (phone help: international format, US 10 digits, mobile numbers get verified). Consider a cross-cutting FR in §4.1 for field-level help. |
| 3 | NG-9023 phone | The **Primary** row (+1 415…) shows **Verify**, meaning a legacy Primary that is *unverified* | FR-15/FR-18 assume Primary implies Verified. There's no rule for existing Primary-but-unverified data | Add to FR-17/FR-18: an existing unverified Primary shows Unverified + Verify/Resend, and it stays Primary (no forced demotion). Same for email in FR-21/22. |
| 4 | NG-9026 addresses | **Collapse (−)** control on each address card ("New Address" heading, collapsible) | missing | Decide whether address cards can collapse in edit mode. If yes, add it to FR-26. If not, record it as an intentionally dropped legacy control. |
| 5 | NG-9024 email, NG-9025 social | Section **Add New** for email/social (the limit is enforced by the platform) | FR-16 has "at most 20 phones". FR-20 (email) and FR-24 (social) have no limit, though addendum §B says 20 per type | Add "at most 20 emails" to FR-20 and "at most 20 links" to FR-24. Disable Add New at the limit, with the reason shown. |
| 6 | NG-9026 addresses | **Set As Primary** radio inside the add/edit form for a *new* address | FR-27 "user can set any address as Primary" (it isn't clear whether that works on an unsaved new address) | State that Primary can be chosen while adding a new address. Saving it demotes the old Primary, PUT first (addendum §A). |
| 7 | NG-9022 personal info | **Clear (×)** on the required Ethnicity select | FR-12 (required, default Unknown) has no rule for clearing | Say whether clearing a required select is allowed (it then fails validation) or whether clear isn't offered on required selects. |
| 8 | NG-9020 tabs | Medical tab shown **disabled** today | FR-32 makes it enabled with "Coming soon" | Intentional change. Note it as a deliberate deviation from today in FR-32 for traceability. |
| 9 | NG-9021 avatar | No visible change-picture affordance (placeholder silhouette only) | FR-10 covers the upload | No gap. Make sure the UX spec gives the upload entry point a visible, keyboard-reachable control (NFR-2). |

## Covered (no action)
- NG-9022: every field, the required markers (first/last name, birth date, race, ethnicity, biological gender, gender identity), the defaults "Unknown"/"Asked but not answered", the date picker and the signature pad with clear → FR-11–FR-14.
- NG-9023: country flag/code picker, Mobile checkbox locked on saved rows, Verify button, notification bell only on Primary (shown off) and delete → FR-15–FR-19.
- NG-9024: locked saved address, notification bell, verified check, delete disabled on the only email → FR-20–FR-23.
- NG-9025: single required Link field, no label/verify/bell → FR-24 (and zero links is now allowed on purpose).
- NG-9026: required/optional fields match FR-26. Country dropdown → FR-26.
- Per-section Cancel/Save → FR-4.
