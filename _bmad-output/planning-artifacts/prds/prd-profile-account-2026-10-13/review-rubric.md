# PRD Quality Review — Profile (Personal Account, Individual Provider Registration, My Organizations)

*Reviewed 2026-10-13 against `.claude/skills/bmad-prd/assets/prd-validation-checklist.md`. Inputs: `prd.md`, `addendum.md`, with spot checks against `research-backend.md` and the sibling `../prd-personal-profile-2026-10-13/prd.md` (PP).*

## Overall verdict
This is a tight, evidence-backed parity PRD. Its FRs are unusually testable: exact copy, debounce values, page sizes, and backend quirks R1, R2, R6 and R7 are turned into explicit consequences. The main risks sit at the seams. First, the Primary Phone rules in FR-107 contradict PP-FR-18 inside the same app. Second, three behaviors that touch login security are unspecified: the base-MFA side effect of FR-111, the retry path after a partial save in FR-109, and the MFA code sent as a query parameter. Third, the release depends on the per-tenant portal URL (OQ1) and on 1health-fe deep-link work (FR-102), and the PRD gives neither a deadline, an owner or a fallback, nine days before code freeze. All of these can be fixed in the document; none of them requires rethinking the module.

## Decision-readiness — adequate
The key decisions are stated as decisions, and each one says what was given up:
- no `switch-tenant` call, because it would revoke the app's session (FR-120, R7)
- password stays read-only, even though the backend supports changing it (FR-106, §6.2)
- locale is written through `/locale` instead of `/edit` (FR-109, R2)
- type filtering is enforced by the app (FR-114, R4)

The one `[NOTE FOR PM]` (change password, §6.2) sits at a real tension.

The weak spot is how the PRD handles its open dependencies against a hard date. The release is 2026-10-29, with code freeze 10-22 and QA sign-off 10-24, and OQ1 controls three FRs. Its only plan is "Revisit before architecture", with no date-bound fallback. If `?ctx=` isn't confirmed, nobody has decided whether the subdomain URL, which forces a re-login, is acceptable for go-live. OQ2 (Patient functionality in the default tenant) carries similar unmanaged risk. If staff-only accounts lack that role, FR-103 turns most of the module into "You don't have access…" cards for those users. That is graceful, but it is a parity regression only if today's screen behaves differently, and the PRD doesn't say whether it does.

### Findings
- **high** OQ1 has no fallback or decision date (§9 OQ1, FR-120, FR-116, FR-119) — "Revisit before architecture" is not a plan for something that blocks Enter portal, the "Register your practice" CTA, and internal organization creation, nine days before freeze. *Fix:* add a decision deadline (e.g. 2026-10-16) and a pre-agreed fallback, e.g. "if unconfirmed, navigate to `https://<subdomain>.<portal host>` and accept the re-login", recorded as a `[NOTE FOR PM]`.
- **medium** OQ2's impact on parity isn't assessed (§2.2 A1, §9 OQ2, FR-103) — the PRD doesn't say whether today's `/personal-settings` also returns 403 for staff-only users. If it doesn't, FR-103's graceful 403 is a silent regression. *Fix:* state today's behavior for a user without Patient functionality, and make "verify on demo with a staff-only account" a dated QA prerequisite for SM-101.
- **medium** NPI claim integrity (R5) is filed as out of scope without a PM callout (§6.2 "name matching or approval for NPIs. These are platform-level decisions") — anyone with Patient functionality can irreversibly claim any free NPI. A migration is a natural moment to raise this, and research flagged it as a compliance question (Q4). *Fix:* add a `[NOTE FOR PM]` naming the risk and its owner, even if the answer for 10-29 is to keep parity.

## Substance over theater — strong
There is no persona theater. The four named protagonists each carry a distinct flow and edge case. The Vision is specific to this screen: "account, as opposed to their personal record". The NFRs have product-specific thresholds: 1.5 s first content, 1 s p75 typeahead, 360 px, focus return, and `autocomplete="one-time-code"`.

### Findings
- **low** The counter-metric balances nothing (§8 SM-C101) — "Counterbalances any registration-volume goal", but no SM sets a registration-volume goal. The sentiment is right but sits in the wrong place. *Fix:* either drop it, or turn it into a guard on SM-101 ("parity QA includes the already-registered checks and the confirmation"), which FR-115 already requires.

## Strategic coherence — adequate
The thesis is clear: move the account screens out of 1health-fe at functional parity, with a small set of state and explanation improvements. Scope follows that thesis. SM-101 is the right go/no-go, and SM-102 targets the riskiest behavior, login identifiers.

Two gaps weaken the arc. First, the Vision ends with "the user-menu account screens leave `1health-fe`", but nothing measures or schedules that outcome: there is no rollout or rollback section and no legacy-retirement metric (compare PP §6 and SM-4). Second, the app now has two places to change Primary Email and Phone, PP-FR-18/22 and FR-107, with different interaction models, and the PRD never acknowledges this.

### Findings
- **high** FR-107 contradicts PP-FR-18 on Primary Phone (FR-107 "Mobile and Landline for the phone picker"; §3 "Mobile or Landline"; PP-FR-18 "Landlines can't be Primary. This is an app rule, matching today"; PP glossary "The Primary Email and Primary Mobile are the user's login identifiers") — two modules in one app would enforce opposite rules on the same login identifier. *Fix:* confirm what `/personal-settings` actually allows today and align both PRDs. If they really differ today, record that difference as a deliberate decision.
- **medium** Two primary-switch flows behave differently (FR-107 vs PP-FR-18/22) — PP asks for a confirmation dialog, while FR-107 shows an inline first-change notice. PP relabels the old Primary to "Old" in a ContactPoint save, while FR-107 does it through `PUT user/edit`. The PRD doesn't say which one is canonical, or why both exist. *Fix:* add a short note to §4.2 stating that both entry points are kept for parity, that they share validation and copy, and which confirmation pattern UX should use.
- **medium** No rollout, rollback or retirement plan (whole PRD; FR-102 only) — the legacy `/personal-settings` route stays "behind the same 1health-fe flag", but there is no rollout order (demo first, then prod), no owner for the 1health-fe user-menu change, and no criterion for removing the legacy route. *Fix:* add a short §6.3 "Rollout and dependencies" that mirrors PP §6. It should name the 1health-fe change, its owner, whether it ships under the PP flag or its own, and a retirement SM.

## Done-ness clarity — adequate
Most FRs meet a high bar. FR-105 gives exact length and age ranges. FR-111 gives distinct outcomes for a wrong code, a closed dialog, and a QR rotation. FR-115 has its own copy for each "already registered" branch. FR-117 specifies page size, debounce, and sort. The weaknesses are a few behaviors where the happy path is precise but the side effects are not. In this module those side effects touch login and security.

### Findings
- **high** FR-111 leaves the base-MFA side effect unspecified ("If base MFA is not enabled yet, the app enables it first… Closing the dialog without a correct code leaves TOTP off") — per research-backend, `POST mfa/enable` turns base MFA on before any code is validated. If the user abandons the dialog, they now get email or SMS codes at every login, which they never asked for, and the app has no way to turn that off (FR-112 leaves base MFA unchanged). *Fix:* state the intended outcome. Either accept it, matching today, and tell the user in the dialog, or add it to Open Questions as a parity question for the platform team.
- **high** FR-109 doesn't define retry after a partial failure ("If any call fails: the Section stays in edit mode… names which part was not saved") — if `PUT user/edit` succeeded with a new email and then time zone failed, a second **Save** that diffs against the original snapshot resends `email`, which R1 rejects as "already exists". *Fix:* add a consequence: "after a partial failure, the parts that succeeded become the new baseline, and a retry sends only the parts that failed." Also say whether time zone and locale are still attempted when `PUT edit` fails. addendum §C calls them "independent" but the order is "edit first".
- **medium** The MFA code is sent in a URL query string (addendum §A `mfa/validate?code=NNNNNN`, §5 "MFA … codes … are never stored in … logs") — query strings end up in proxy and access logs, and `authFetch` logs every request URL to the console (CLAUDE.md). *Fix:* add an NFR consequence that the BFF proxy and client logging redact `code` on `mfa/validate`, and make it a QA check.
- **medium** The FR-116 field list is ambiguous ("Address of practice (lines 1–2)" and also "practice address"; "Values of 'n/a' or -1 show as blank or 'Not provided'"; "Licenses") — it isn't clear whether there are one or two addresses, which empty treatment applies, or how multiple licenses are formatted. *Fix:* list each displayed field with its source field from `user/npi` and a single empty-value rule. A table in the addendum is enough.
- **low** FR-108's "shown by its label when one is known" leaves the source of known labels open (the app constants, a wider ISO map, or a case-insensitive match such as `en-us` → `en-US`). *Fix:* name the lookup rule.
- **low** FR-114's (i) content is "Final copy is set in UX" — this is acceptable because the required points are listed, but story acceptance needs to know that copy sign-off is a dependency.

## Scope honesty — strong
§6.2 and §7 do real work: change password with its reason (R3), MFA recovery codes and manual secret, separate format preferences, NPI edit and unregister, organization capabilities, and admin flows. Every UX delta is marked "new" or "today … that is not kept" inline, so the reader never has to guess what differs from parity. There are four Open Questions, four Assumptions and one PM note. That is moderate for a green-light PRD, but OQ1 and A2/OQ3 sit directly on the release path, so the density matters more than the count suggests (see Decision-readiness).

### Findings
- **low** The Vision's list of deltas is shorter than §6.1 (§1 "a small set of agreed UX fixes" lists four; §6.1 adds the Register confirmation, skeleton, 403 and error states, and FR-110, FR-114, FR-118 add the inactive-tile hint, the search-error message and the unknown-type fallback) — this isn't hiding anything, but a reader of §1 would underestimate the deltas. *Fix:* say "including" in §1, or point to §6.1 as the authoritative list.

## Downstream usability — strong
- The FR, UJ and SM IDs are contiguous and offset so they can't collide with PP: FR-101–120, UJ-101–105, SM-101–104 and C101.
- The glossary is present and used consistently: Primary Email, Verified, Organization, Enter portal.
- Each FR names its tab and the UJ it realizes.
- The addendum's endpoint map is keyed by FR number, which is exactly what story slicing needs.
- The parity constants (time zones, organization-type map, feature-row copy) are captured, so the UX and dev steps don't need to re-mine 1health-fe.

### Findings
- **medium** SM-101's parity denominator isn't defined ("100% of today's `/personal-settings` capabilities pass on demo… covering FR-104 to FR-120") — no capability inventory is named, and FR-101–103 (routing, deep links, 403 handling) are left out even though they're needed for go/no-go. *Fix:* point SM-101 at a parity checklist, e.g. the capability list in `research-1health-fe.md`, and extend the coverage to FR-101–120.
- **low** UJ-105 has no protagonist and no inline context ("Same as PP UJ-5 (PP-FR-2)") — it works when read next to PP, but not when extracted on its own. *Fix:* give it a protagonist (e.g. Daniel mid-edit on Personal Account) and one line on what survives the relaunch.

## Shape fit — strong
A brownfield parity migration with a fixed date fits a capability-spec shape: FR consequences carry acceptance, five short UJs cover each tab's main path plus one edge case, and the SMs are operational (QA pass, support tickets). The code references are specific and checkable (file:line in the research, `AccountSettingsForms.ts:10-17`, `forceDefaultContext`, the backend R-numbers). The PRD isn't over-formalized: there's no persona section, and the JTBD list is short. The one thing a brownfield-with-cutover shape would normally include, and this PRD lacks, is the rollout and dependency section noted under Strategic coherence.

## Mechanical notes
- **Assumptions Index roundtrip:** A1–A4 each appear inline (§2.2, FR-102, FR-116, FR-120) and are indexed in §10. OQ2 and OQ3 map to A1 and A2, but §10 doesn't link back to the OQs, and A1 lacks the "(pending …)" status that A4 has. Minor.
- **Glossary drift:**
  - "Primary Phone" is defined as Mobile or Landline (§3), while PP's glossary says "Primary Mobile". Resolve this with the FR-107 finding.
  - "Primary Email Address" (FR-104 label) and "Primary Email" (glossary) are both used. This is fine as a UI label versus a term.
  - "Healthcare credentials" (§4.4 card title) isn't in the glossary.
- **Cross-references:**
  - PP-FR-1, -2, -3, -4, -6, -7 and -8 all resolve in the sibling PRD.
  - FR-101 cites PP-FR-3 for the keep, discard or save prompt, which is correct.
  - FR-120 cites PP-FR-6 for leave protection, but PP-FR-6 only covers close, reload and "Return to 1health". Enter portal is a new trigger and should be stated as an extension.
  - "PP §2.2" and "PP §4.4–4.5" resolve.
- **Non-goal overlap with PP:** PP §7 lists "Account settings (password, locale, time zone)" as a non-goal. That is consistent, since this PRD is where they now live, but a one-line note in PP pointing to this PRD would keep the two in sync.
- **Required sections:** all present for the stakes. The only structural gap is a Rollout and Dependencies section (see Strategic coherence).
- **Date header:** "Target release: 2026.07.01 'Conduit', 2026-10-29". The version string and the date look inconsistent at first read. Confirm that "2026.07.01" is the release train name and not a date.
