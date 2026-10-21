# Integrated block acceptance audit

## Result

No additional concrete acceptance defect was confirmed in the paths inspected. This is a targeted static acceptance review, not an assertion that every acceptance criterion or every line of the 97,669-line block was exhaustively verified.

## Scope and precedence

Reviewed the integrated implementation as one block, using `block-full.diff` and the supplemental `block-fixes.diff`, repository `CLAUDE.md`, `docs/FOUNDATION.md`, the applicable React Framework-app rules, story criteria in `_bmad-output/planning-artifacts/epics.md`, and approved story specifications/decision logs for the inspected flows. Preserved SWR, project transport, Section and message/error patterns. No application files changed, tests run, external requests made, or agents spawned in this audit.

Included implemented Stories 1.1–1.15, 2.1–2.4, 3.1–3.7, 4.1–4.4, 7.1–7.6, 8.1–8.3 and 9.1 as the acceptance boundary. Did not flag backlog 1.16, 5.*, 9.2/9.3, 10.*, or the Medical placeholder as missing work. The primary deep inspection concentrated on cross-team and multi-operation flows; foundation/auth/security are not independently certified here.

## Concrete acceptance checks

| Constraint | Inspected evidence | Assessment |
| --- | --- | --- |
| Save all belongs to Profile and uses the shared order and registry | `app/page.tsx:26–27` passes `SAVE_ORDER` and `SaveAllBar`; `app/account/page.tsx` composes Account without either slot; `features/save-all/save-all-bar.tsx` calls shared `runSaveAll`, uses page-order post-run focus and suppresses summaries for session outcomes | No sampled violation |
| Contact writes must update shared identity/contact reads used by Account/header; auto-verification must belong inside each Section save, including Save all | `features/contacts/phone-section.tsx:567–597`, `features/contacts/email-section.tsx:498–524`: successful manage write, bound Contact Point refresh, `mutateMyself`, then `sendAfterSave(newUnverifiedContactPoints(...))`; `features/account/account-settings-section.tsx:122` refreshes shared myself and Email/Mobile/Landline keys | No sampled integration violation |
| Make-primary consent and retries must recheck eligibility | `features/contacts/contact-primary.tsx:99–124` checks current eligibility before sending and refetches the saved reads; `:145–171` retains standard confirm, busy flow and heading focus; Phone and Email supply latest saved rows rather than draft-selected Primary values | No sampled violation |
| Account partial saves attempt all ordinary failures, stop for expiry and retain acknowledged fields for retry | `features/account/account-save.ts:40–62` uses `runSaveSteps(mode: "attemptAll")` and rebases succeeded parts; `features/account/account-settings-section.tsx:38–60,103–119` retains acknowledgements over predecessor reads; `features/shell/run-save-steps.ts:91–116` stops on session failure | No sampled violation |
| Address writes run new Primary first, other writes next, deletes last, then merge fresh rows after partial failure | `features/addresses/save.ts:23–35,83–103`; `features/addresses/addresses-section.tsx:875–977` builds ordered steps and tracks created/deleted acknowledgements, with a fallback that prevents re-POSTing successful creates after a failed refresh | No sampled violation |
| Pending Places details must not overwrite subsequent manual address edits | Supplemental `features/addresses/addresses-section.tsx:997–1005` compares all relevant address fields with the picked snapshot before applying details; maintenance tests include City, Zip, State, County, line 2 and Country edits while details are held | Maintenance correction matches intended edit preservation |
| SSN and Signature remain outside drafts and Signature uses the approved ownership-safe replace flow | `features/personal/personal-section.tsx` wires approved `PERSONAL_DRAFT_FIELDS`; `features/personal/signature-save.ts:104–141` uploads then performs approved best-effort old-file cleanup, and removes leftover relations with a bounded loop; approved `spec-2-4-signature.md` Decisions/Implementation Notes override the old version endpoint criterion | No sampled violation; no request to restore the unsafe version endpoint |
| Provider 9.1 must refresh registration state per opening, suppress requests after expiry, keep searches ephemeral and leave Register inert | `features/provider/use-provider-controller.ts:14–35` uses the NPI key only, fresh opening mutate and expiry subscription; `features/provider/npi-search.tsx` uses uncached cancellable searches; `spec-9-1-registration-state-and-npi-search.md` frozen boundaries explicitly exclude registration and the full 9.3 view | No sampled violation; excluded backlog deliberately remains absent |
| Places/NPI logs must be metadata-only despite the general D6 dev logger | `lib/api/log-api-call.ts:67–70` explicitly covers both NPI routes and both Places routes; maintenance adds real transport Places privacy regression in `lib/api/places.test.ts` | No sampled violation |

## Apparent discrepancies correctly excluded

- Address Make primary uses one PUT. This is explicitly approved by `spec-4-4-primary-address-and-removal.md:57` and its human change log at `:142`, superseding the epic criterion that calls for a second demotion PUT.
- Address line 2 preserves Verified. Human decision 2a in `spec-4-3-address-suggestions-via-server.md:55` supersedes the earlier address-part rule.
- Signature replacement uses upload plus ownership-checked delete rather than file version; the approved Story 2.4 decision and later ownership renegotiation explicitly require this.
- Successful Profile Picture upload followed by a failed non-session relation read is treated as saved, with revalidation, as expressly approved for Story 1.10. No finding demands changing that outcome.
- No CSRF/session-binding finding is raised: D5 deliberately removes those checks. No general ban on local-development body logs is raised: D6 applies with the explicit Places/NPI metadata exceptions.

## Inspection limits

The full diff is 97,669 lines and the maintenance diff is 1,742 lines. Inspected their structure and selected source/spec/test hunks, with detailed source tracing of the flows listed above; did not read all 97,669 lines or independently exercise every story, browser state, viewport, upstream DTO, accessibility criterion, security property, or test assertion. Some long tool reads were truncated, so they were used as navigation/context rather than claimed as complete reads. No automated gate result is claimed from this subreview; root is running validation. Existing specification verification histories are historical evidence, not fresh test executions.

Root separately reported a source-map-js transitive dependency advisory and a missing CI dependency-audit gate, and is applying a narrow correction. Those are outside the story-behavior acceptance findings above and are not duplicated here. The absence of an additional finding means only that no sufficiently evidenced new defect emerged in this targeted inspection.
