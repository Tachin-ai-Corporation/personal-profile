# Epic 9 Context: Individual Provider Registration

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Rebuild provider registration within `/account?tab=provider` as one Healthcare credentials Section. Users link their personal NPI and optionally their practice NPI, then inspect their registered credentials, signature and practice support contact. Registration is a one-time association: this app provides no edit or unregister capability.

## Stories

- Story 9.1: Registration state and NPI search
- Story 9.2: Register
- Story 9.3: Registered view

## Requirements & Constraints

- Operate only on the launching user's own record in the personal tenant. A personal NPI is required; a practice NPI is optional. Personal searches permit individual records only; practice searches permit organizations only. Registration and availability checks use registry record ids, never the ten-digit NPI value.
- Determine registration from whether the user's provider NPI exists. Registered users must never see the search form. Loading must show a skeleton and failures must show a retryable error rather than an empty form. Fetch provider data only when its tab mounts; fetch support contact only when its popover opens.
- Keep search text, results and selections in component memory. Never put selections/results in drafts, persistent storage, SWR, URLs, logs or telemetry. Session expiry and reload discard selections. Never log search queries.
- Before registration, check each selected record's availability. Taken records produce field errors and prevent submission. Guard the complete operation against duplicate activation; register directly without a confirmation dialog. Success refreshes registration state, discards selections and focuses the Section heading. Failure retains selections and presents field errors or an inline banner, cleared on the next attempt.
- Registered credentials are read-only and include personal NPI, taxonomy, HIE, practice details, licenses, address and signature. Missing/sentinel values become human-readable placeholders. The membership notice and practice-registration action are mutually exclusive.
- Meet WCAG 2.1 AA in both themes, support keyboard-only use, reduced motion and 360 px screens without horizontal overflow. Use semantic design tokens and English copy.

## Technical Decisions

- Reuse the shared foundation; consult `docs/FOUNDATION.md` and each story's foundation notes before implementation. Shared changes require foundation delivery; do not duplicate existing controls or infrastructure.
- Browser traffic uses the same-origin API transport. Add exact endpoint/query/body contracts to the NPI allowlist area. Provider passthrough endpoints participate in the Account kill switch. Use template-only logging and no-store responses.
- Separate typed search functions lock entity type inside the API module; feature components never choose it. Search is uncached, zero-based and paginated. Registration state uses the shared NPI SWR key.
- An upstream forbidden response replaces the Provider tab, preserving other tabs. A proxy-originated denial instead receives generic error handling. Practice-support forbidden responses affect only their popover. Session errors use the shared session flow. Mutation retries occur only after the transport's token-expiry refresh; never replay registration automatically after network failures, timeouts or server errors.
- Match upstream error text only through the provider error mapper. The later foundation decision supersedes legacy prefix-based NPI errors: actual backend Personal/Practice NPI registration messages map directly to their respective field errors.
- Practice support comes through the named server operation, which derives the tenant from the user's registered practice and returns only support name, phone, region and email. Never accept a browser-selected tenant or expose tenant configuration as passthrough. Membership comes solely from the launching user's tenant list through the shared membership helper.
- Practice-registration eligibility uses the practice record id, verified status and absence of an organization. Failed eligibility checks show no action. Signature images use the protected image download path; safe support links use the existing protocol validator. Navigation and same-tab portal handoff run through shell leave protection, retaining drafts without logout.

## UX & Interaction Patterns

- The Section heading has a provider-information popover explaining the permanent association. Non-modal information popovers open on delayed hover, focus or tap; focus-open does not steal focus, and Escape returns focus to the trigger.
- Present stacked comboboxes and a right-aligned Register action. Controls open on focus, debounce typing for 600 ms, cap input at 100 characters and load ten results per page. Abort obsolete queries. Options expose NPI/name/location accessibly and support standard combobox keyboard actions.
- Announce search progress, result counts, empty results and errors. Retry repeats the same query/page while retaining already loaded options. Registration progress and field errors are announced.
- Registered values use two key/value pairs per desktop row and one per mobile row. Wait for membership data before showing a notice or action.

## Cross-Story Dependencies

The Account route, tabs, session/leave protection, shared read states and portal handoff depend on Epics 1 and 7 and their foundation. Story 9.1 establishes state detection, search and a minimal registered NPI view; its Register action may remain inert until 9.2. Story 9.2 adds registration against that existing view. Story 9.3 expands it without requiring earlier stories to depend on future work, reusing 9.2's availability endpoint. Shared popovers, safe links and protected signature delivery are reused across provider, organization and personal-profile work.
