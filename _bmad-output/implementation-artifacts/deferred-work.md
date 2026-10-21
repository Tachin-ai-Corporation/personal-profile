# Deferred work

<!-- Tracking rule (spec F6-3): add a new item under the section of the team that owns it.
     Team A = `/` (Epics 1-6), Team B = `/account` (Epics 7-10), Foundation = shared code
     (lib/server, lib/api, lib/shared, components/ui, features/shell, tooling) or cross-team.
     Feature branches append only at the end of their own team's section, so merges don't conflict. -->

## Team A (`/`, Epics 1-6)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`
  summary: PUT v2/user/edit body schema lacks namePrefix, nameSuffix, otherNames, titles, cityOfBirth and accepts birthDate "n/a" although the backend type is LocalDate.
  evidence: backend UserServiceImpl.validateUserAttributes applies only non-null fields (partial update, no wipe); the Personal information card story must add the fields and confirm how a birth date is cleared on demo (unverified).
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-2-shell-navigation.md`
  summary: Header shows primary phone numbers raw (e.g. +12125550100) although phoneNumberRegion is mapped.
  evidence: features/header ContactItem prints value; formatPhoneDisplay() arrives with Story 7.4 and should be applied to the header then.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-2-shell-navigation.md`
  summary: A failed save inside the leave guard closes the dialog with no Section-level feedback.
  evidence: Story 1.13 only requires staying on the page; per-Section save error UI lands with the edit model (7.5).
- source_spec: `_bmad-output/implementation-artifacts/1-8b-profile-page-shell-app-bar-tabs-and-section-navigation.md`
  summary: PM copy question: the load-error template lower-cases the Section label ("Couldn't load phone", "Couldn't load personal information"), while EXPERIENCE.md's example reads "Couldn't load phones".
  evidence: EXPERIENCE.md lines 73 and 156. Story 1.12 owns the message catalog and error copy.
- source_spec: `_bmad-output/implementation-artifacts/spec-f1-shared-contracts-and-data-layer.md`
  summary: Product questions found in the backend while planning F1 — (1) the backend's patient-supported contact types omit "Social Media" (Story 3.7, Team A); (2) backend primary contact types are Email and Mobile only and myself.phoneNumber comes from the primary Mobile, but Story 7.6 lets a Landline be the primary phone (Team B); (3) myself has no phoneNumberRegion (Story 7.4 must take it from the matching contact point row or default to US).
  evidence: 1h-ng-bo-core-be ContactPointConstants.java:37,151-160; UserServiceImpl.java:2769-2786. Verify on demo before Stories 3.7 / 7.4 / 7.6.
- source_spec: `_bmad-output/implementation-artifacts/spec-f1-shared-contracts-and-data-layer.md`
  summary: RESOLVED 2026-10-14 — the three contact-point product questions were validated against agents.md (dev/demo/prod), the backend and 1health-fe: (1) Social Media is a valid patient type via POST /v2/health/contact-point; (2) Story 7.6 primary phone = verified Mobile only (Landline rejected by PUT v2/user/edit; 1health-fe's Landline option is a latent bug); (3) phone region comes from the contact-point list row, default "us". Stories 7.4/7.6 and the F1 spec are amended.
  evidence: agents.md v2/health/contact-point (demo), v2/user/contact-point/list, v2/user/myself; ContactPointServiceImpl.java:196-253,528-546,583-618,796-860; UserServiceImpl.java:625-648,2769-2786; 1health-fe PersonalAccountUtils.ts:53-62.
- source_spec: `_bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md`
  summary: Backend follow-ups found while planning F2 — (1) hard DELETE v2/file targets the public bucket only, so private signature/insurance-card objects may stay in S3 (still open after F7-2: the BFF now ownership-checks every delete in the named op `DELETE /api/pp/file/{fileId}`, but the hard delete itself is unchanged); (2) file uploads have no server-side ownership check on the person/insurance id (the BFF's `me` substitution and id regex are the only guard).
  evidence: 1h-ng-bo-core-be FileServiceImpl.java:797-816; OneHealthServiceImpl.java:4552-4562. Report to the backend team.
- source_spec: `_bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md`
  summary: Public profile picture uploads pass the original bytes (EXIF incl. GPS, trailing payloads) — the BFF only sniffs magic bytes; client-side reencodeImage (Story 1.10) is not a server guarantee.
  evidence: lib/server/proxy/upload.ts; isPublic=true entry in allowlist/core.ts. Story 1.10 (Team A) must decide server-side re-encode/metadata strip (e.g. sharp) or record it as an accepted AD-13 risk.
- source_spec: `_bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md`
  summary: Signature-version (`v2/file/{fileId}/version`) and insurance uploads trust client-supplied ids, checked only as numeric ids; ownership is enforced only upstream (and the backend has no ownership check). File deletes are no longer in this item: since F7-2 they are ownership-checked on the server (`DELETE /api/pp/file/{fileId}`, 404 `NO_FILE`), and `DELETE v2/file/**` is denied in the proxy.
  evidence: allowlist/personal.ts, allowlist/insurance.ts; backend follow-up already recorded (OneHealthServiceImpl.java:4552-4562). Stories 2.4 / 5.3 should resolve ids from myself / the user's own insurance list, or a named op should verify ownership.
  resolution: Signature part RESOLVED 2026-10-16 (spec-2-4-signature, human decision): the `POST v2/file/{fileId}/version` entry is removed (the proxy answers 403 `NOT_ALLOWED`); a Signature replace is the upload to the caller's own person (`me`) followed by the ownership-checked delete of the old file (`DELETE /api/pp/file/{fileId}`), with the old id taken only from `myself.signature`. The insurance uploads stay open for Story 5.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md` (code review, 2026-10-14)
  summary: CSP has no Google Maps hosts for `PLACES_ENABLED=1`; decide with the Places epic (AD-14 proxies Places through `/api/places`). (resolved 2026-10-19, spec-4-3-address-suggestions-via-server: no CSP change. The browser never contacts Google; the app calls only `/api/places/*` and loads no Google script, image or font, so `connect-src 'self'` holds. The attribution is text.)
  evidence: moved from the spec-7-0a code-review list by spec F6-3; Story 4.3 decides.
- source_spec: `_bmad-output/implementation-artifacts/spec-f6-3-data-server-tests.md` (review, 2026-10-14)
  summary: Two sources of truth for Person options: the `GET v2/type/key/Person` VALUE_LIST values (what the Section offers) vs the fixed `RACES` / `ETHNICITIES` / `BIOLOGICAL_GENDERS` enums the proxy's `PUT v2/user/edit` schema accepts. A value the platform adds to the type would show in the picker and then fail with 400 `BAD_BODY`. (resolved 2026-10-16, spec-2-2-edit-and-save-personal-information: the UI intersects, the schema stays. The pickers offer `usePersonOptions` ∩ the enum copies in `lib/shared/person-options.ts` (`offeredOptions`; an empty intersection uses the fallback, the preselect is always offered); a drift test in `allowlist/personal.test.ts` keeps the copies equal to the proxy enums; a saved platform-only value shows through `Select unlistedValue` and is never sent unchanged. A value the platform adds is therefore not offered until the enums (backend `PersonConstants`) and the proxy schema add it.)
  evidence: lib/api/type-keys.ts#valueListOptions, lib/server/proxy/allowlist/personal.ts; Story 2.1/2.2 decide which list wins (intersect in the UI, or widen the schema).
- source_spec: `_bmad-output/implementation-artifacts/spec-f6-2-shared-ui-kit.md` (review, 2026-10-14)
  summary: Phone input country picker has no type-to-search: Radix Select typeahead in the 245-item list only matched the last key under Playwright (first letter + arrows work). No AC requires search; revisit if PM asks (e.g. the F5-2 Combobox with `staticOptions` as the picker).
  evidence: components/ui/phone-input.tsx; e2e/ui-kit.spec.ts "country picker" case (first-letter typeahead + arrows); spec F6-2 Implementation Notes.
- source_spec: `_bmad-output/implementation-artifacts/spec-f6-2-shared-ui-kit.md` (review, 2026-10-14)
  summary: The phone input re-renders all 245 country `SelectItem`s on every keystroke; memoize the item list per locale if a phone-heavy Section (3.2 with many rows, 5.2) shows input lag.
  evidence: components/ui/phone-input.tsx maps `phoneRegions(locale)` (the data is cached, the elements are not).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-change-profile-picture.md`
  summary: (Cosmetic, accepted 2026-10-15) After a picture change the avatar may still show the initials briefly. The bounded preload of the new preview can't be reused by the `<img>`, because `v2/user/profile-picture/preview` is served `private, no-store`, so the browser may fetch it again. Caching stays unchanged (human decision).
  evidence: Story 1.10 implementation report; `asImage` responses are always no-store (F2). The spec's preload was kept; the flash was not confirmed in a real browser.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-signature.md`
  summary: Backend follow-up — no file date exists for the Signature (`myself.signature` is `{id, name}`, no file metadata endpoint), so the edit help omits "Saved {date}." and the read view (UJ-3) omits "Added {today}". The backend could add `created` to the `myself` signature query cheaply; the help line and the thumbnail meta would then show it.
  evidence: lib/api/myself.ts (`MyselfSignature`); spec-2-4-signature Design Notes.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-signature.md`
  summary: Accepted — a replace normally leaves nothing behind: the named op owns every `PersonHasSignatureFile` relation of the caller (foundation a0c01dc), so the old file is deleted (204). Only when that best-effort delete itself fails (5xx, timeout, as in Story 1.10) does the older relation stay behind the newest one. `myself` shows the newest, and Remove deletes every leftover (up to 5 more rounds), so an older Signature is never shown; the file itself stays until then (and hard delete may still leave the private S3 object, item above).
  evidence: features/personal/signature-save.ts (`uploadStep`, `removeStep`, `SIGNATURE_REMOVE_ROUNDS`); lib/server/named-ops/file-delete.ts (`signatureRelationIds`).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-verify-phones.md`
  summary: PM/backend question — the verify resend cooldown disagrees. The AC shows "Link sent · Resend in 60 s" and enables "Resend verification" after 60 s, but the backend refuses a resend within 60 minutes of a successful send (400 "There is already a pending verification for Contact '…' submitted within the last 60 minutes."). The app keeps the 60 s countdown and shows the refusal as the row's help "A link was already sent in the last hour. Check your texts." (DRAFT COPY, rule `contacts.verifyCooldown`). Align the countdown or the backend window, and confirm the copy.
  evidence: 1h-ng-bo-core-be OneHealthServiceImpl.java:2634 (`CONTACT_POINT_ALREADY_REQUESTED_VERIFICATION`, Messages.java:1066); lib/api/errors/contacts.ts; features/contacts/phone-section.tsx (`VERIFY_COUNTDOWN_MS`).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-verify-phones.md`
  summary: Backend follow-up — `POST v2/health/contact-point/verify` reflects only the last contact point it processed. `sendVerificationInstructions` reassigns `notDeliveredInstructions` on each pass, so a send failure before the last one is dropped. The answer can then be `success: true` with an empty list, and the failed row's verification is not marked used, so the 60-minute cooldown blocks a resend of a link that never went out. In the app that row shows as sent (counting down). Ask the backend to accumulate every failed id.
  evidence: 1h-ng-bo-core-be OneHealthServiceImpl.java:2650-2665 (`sendVerificationInstructions`), :2528-2537 (`RequestCPVerificationResponse.failed`, `updateContactPointVerificationsToUsed`); lib/api/contacts.ts (`sendContactVerification`).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-make-a-phone-primary-and-manage-notifications.md`
  summary: Backend follow-up — `isVerified` may be writable through `contactPointsToUpdate` of `POST v2/health/contact-point`. `ContactPointToUpdateDTO` extends `BaseContactPointDTO`, which carries `isVerified`, and `updateContactPoints` maps the whole DTO onto the entity (`Helper.mapper.convertValue`) before `repository.update`, so a caller could mark its own number verified (and then make it Primary). The app never sends it, and the strict proxy schema (`contactPointManageBodySchema`: update rows are `{ id, type, label, isNotificationEnabled? }` only) refuses it with 400, so this app can't. Ask the backend to ignore `isVerified` on update (and on add).
  evidence: 1h-ng-bo-core-be BaseContactPointDTO.java:25, ContactPointServiceImpl.java:393-415 (`updateContactPoints`); lib/server/proxy/allowlist/contacts.ts (`contactPointManageBodySchema`).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-view-add-relabel-and-remove-emails.md`
  summary: Phone's read-view kebab offers Remove on a repeated-id row. `PhoneReadActions` checks only `row.point.id === null`, not `isRepeat(row)`. Its edit row has `id: null`, so the row shows struck through with no Restore, and Save sends nothing but still toasts "Phone saved.". Fix it as Email does in Story 3.5: no Remove on a repeat row. (resolved 2026-10-19, spec-3-6-verify-emails-make-an-email-primary-and-manage-notifications: `PhoneReadActions` offers no Remove when `isRepeat(row)`; test "offers no Remove on a repeated id's later occurrence" in `features/contacts/phone-section.test.tsx`)
  evidence: features/contacts/phone-section.tsx (`PhoneReadActions` Remove item; `baseline` nulls a repeat's id; the edit `actions` return `null` for a saved row without an id). Found in Story 3.5 review (row 25). Spec 3.5 forbids changing Phone behaviour.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-6-verify-emails-make-an-email-primary-and-manage-notifications.md`
  summary: Phone's restored stale draft can turn off a new Primary's notifications. A draft stored while a Mobile wasn't Primary holds its `notifications: false`; once that Mobile is made Primary elsewhere (another tab, `/account`), `editedContactPoints` applies the draft's value because the saved row is now Primary-labelled, and Save sends notifications off. Fix it as Email does in Story 3.6: also require the edit row's label to be Primary.
  evidence: features/contacts/phone-section.tsx (`editedContactPoints`, `point.label === PRIMARY_LABEL && typeof edit.notifications === "boolean"`). Found in Story 3.6 review (row 19). Spec 3.6 keeps Phone's behaviour unchanged.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-view-addresses.md`
  summary: Confirm the `GET v2/person/location/list` row shape on demo before Story 4.2 writes addresses: whether the booleans come back as `primary`/`validated` (backend code) or `isPrimary`/`isValidated` (agents.md), and whether `personLocationType` is always present (the loader ignores the wire `type`; a null type leaves the Type cell empty).
  evidence: lib/api/addresses.ts (`addressWireSchema`, `toAddress`); 1h-ng-bo-core-be PersonLocationResponseDTO.java (Lombok booleans with `@JsonAlias`, input only). Review row 5 of spec 4.1.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-add-and-edit-addresses.md`
  summary: Backend/docs follow-up — the agents.md docs for the person location endpoints show `isPrimary` / `isValidated`, but the backend's `PersonLocationRequestDTO` reads only `primary` / `validated` (no Jackson aliases; `is…` is silently ignored, and on PUT an ignored `primary` demotes the current Primary). Fix the docs. The app sends `primary` / `validated` (human decision 1a) and reads both forms.
  evidence: 1h-ng-bo-core-be PersonLocationRequestDTO.java:20-36 (no annotations), PersonLocationResponseDTO.java:31-37 (`@JsonAlias` on input only), PersonLocationFactory.java:211-231; ai-agents-knowledge person location docs.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-add-and-edit-addresses.md`
  summary: PM/backend question — clearing an optional address field (line 2, county, state) stores the literal "n/a". `PUT v2/person/location/{id}` keeps the old value for "" or null, so the app sends "n/a" (human decision 2a). This app reads it as empty, but other 1health screens that read the address may show "n/a" as text. Ask the backend for a real clear (e.g. treat "n/a" as null for location strings) or confirm that every screen treats "n/a" as empty.
  evidence: 1h-ng-bo-core-be PersonLocationFactory.java:234-268 (`StringUtils.getValueOrDefault(x, null)`, EntityMapper skips nulls), no "n/a" handling for location strings; lib/api/addresses.ts reads "n/a" as absent.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-add-and-edit-addresses.md`
  summary: PM/backend question — the app never sends `countryCode` (human decision 3a: the countries list has no ISO codes, POST ignores it, PUT stores it as given). After a country change on an edited address, the stored `countryCode` stays the old one, so any other screen that uses `countryCode` may show or act on a stale code. Ask the backend to derive or clear `countryCode` from `country`, or to add codes to `GET v2/public/countries`.
  evidence: 1h-ng-bo-core-be LocationEntity.java:114-135 (POST never sets countryCode), PersonLocationFactory.java:256 (PUT stores it as given), PublicResource.java:63-65 (`{id, name}` only); the 4.1 read view lets the country name decide.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-add-and-edit-addresses.md`
  summary: Backend follow-up (bug) — `PUT v2/person/location/{id}` without `primary` (missing or null) demotes the current Primary and leaves the person with no Primary address. `verifyPrimaryLocation` returns early only for `Boolean.FALSE`; null falls through to "set as primary (unset the old primary location)", but the edited location isn't made Primary because its `primary` stays null. Ask the backend to treat a missing `primary` on PUT as "unchanged". The app always sends `primary` explicitly, so it never triggers this.
  evidence: 1h-ng-bo-core-be PersonLocationFactory.java:211-231 (null falls into the set-as-primary branch), :239-243 (the edited row's primary is only set when not null).
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-add-and-edit-addresses.md`
  summary: Backend question — confirm the real length limit of a person location's `fullAddress` (and the other address attributes). The app sends a `fullAddress` rebuilt from line 1, city, zip and country on every PUT (the backend doesn't rebuild it), and the proxy allows up to 1,100 characters (user decision). If the backend's Location type configures a smaller `maxLength`, a long address would fail its PUT with an unmapped error; lower the cap and show "This address is too long. Try shortening it." then.
  evidence: 1h-ng-bo-core-be TypeUtil.java:214 (text attributes are Postgres `text`), :338-364 (a per-attribute `maxLength` is database configuration), LocationEntity.java:35-36 (`@BoAttr` with no length); the agents.md docs list no limit. lib/server/proxy/allowlist/addresses.ts (`ADDRESS_FULL_ADDRESS_MAX_LENGTH`).
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-add-and-edit-addresses.md`
  summary: Editing an address that was removed elsewhere (another client) fails its PUT with "Operation failed. Location with id: '…' is not related to '…' with id: '…'.", which is unmapped (generic Section error), and Retry repeats the same PUT. Map it ("This address was removed. Cancel to see your current addresses." DRAFT) and drop the row from the next send.
  evidence: 1h-ng-bo-core-be PersonLocationFactory.java:92-97,149 (`LOCATION_IS_NOT_RELATED_TO_ERROR`); lib/api/errors/addresses.ts; features/addresses/save.ts (`mergeAddressRows` keeps a saved row the refetch no longer has). Review row 10 of spec 4.2.
  resolution: RESOLVED 2026-10-20 (spec-4-4-primary-address-and-removal, decision 2A): the anchored rule in `lib/api/errors/addresses.ts` maps it to "This address was removed elsewhere, so your changes to it weren't saved." (DRAFT); `mergeAddressRows` now drops a saved row the refetch no longer holds, so Retry never re-sends it; a DELETE answered that way counts as done.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-add-and-edit-addresses.md`
  summary: Rebase a restored Addresses draft onto the current saved rows (`useSectionForm` `transformDraft`, main 6c31204), keeping only the fields the user changed, as `mergeUnsent` does after a failed save. Today a restored draft re-sends values that changed on the server since, and misses addresses added elsewhere. Add a draft-restore test harness, and with it the new-row key collision test (a restored `new-1` row, then Add address).
  evidence: features/addresses/addresses-section.tsx (`draftFields: ["rows"]`, `nextNewKey`), features/addresses/save.ts (`mergeUnsent`), features/shell/use-section-form.ts (`transformDraft`). Review rows 11–12 of spec 4.2.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-address-suggestions-via-server.md`
  summary: Release blocker before `PLACES_ENABLED=1` — decide on a server-side throttle for `/api/places/autocomplete` (paid Google calls). None exists: Team B dropped the shared limiter (the proposal on `feat/foundation-mfa-validation-throttle` was superseded 2026-10-19), and the backend's 500/min limit doesn't cover our server's Google calls. The client debounces at 250 ms with a 3-character minimum, which doesn't stop a crafted caller. Human decision 1a: nothing now, decide before enabling.
  evidence: lib/server/named-ops/places.ts (no limiter); the earlier "No per-session throttle on /api/places/autocomplete" item in this file; spec 4.3 decision 1a.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-address-suggestions-via-server.md`
  summary: PM/legal, before `PLACES_ENABLED=1` — confirm the Google attribution. The suggestions show "Powered by Google" as text (human decision 3a). Google's Places policies may require the Google logo image when suggestions show without a Google map; if so, add a local SVG following Google's brand rules (`img-src 'self'` holds, no CSP change).
  evidence: features/addresses (the line 1 Combobox `endMessage`); spec 4.3 decision 3a.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-address-suggestions-via-server.md`
  summary: Restored Addresses drafts now also carry `validated` (Story 4.3). When the draft rebase (the 4.2 `transformDraft` item above) is built, it must reset `validated` to the saved value for any row whose address parts changed on the server since the draft, so a stale draft can't re-send `validated: true`.
  evidence: features/addresses/schema.ts (`validated` is form state since 4.3), the 4.2 draft-rebase entry. Review row 12 of spec 4.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-address-suggestions-via-server.md`
  summary: Backend/Foundation follow-up — "Verified" is asserted by the client. The proxy's `POST`/`PUT v2/person/location` body accepts any `validated` boolean and the backend stores it as given, so any caller can mark its address verified without a Places details answer. Options: the backend validates server-side, or a named op ties `validated: true` to a recent details answer for the same session.
  evidence: lib/server/proxy/allowlist/addresses.ts (`validated: z.boolean()`), 1h-ng-bo-core-be PersonLocationFactory (validated stored as given). Review row 13 of spec 4.3.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-primary-address-and-removal.md`
  summary: Untested — after a save where one `DELETE` succeeds, a later step fails and the list refetch also fails, the deleted row leaves the form (`!rebased && … deleted.size > 0`), so Retry doesn't `DELETE` it again.
  evidence: features/addresses/addresses-section.tsx (the no-rebase branch of `save`); the `addresses-section.primary.test.tsx` server never fails the refetch during a removal. The regression would be masked by "already gone counts as done", so it costs one redundant request. Review row 14 of spec 4.4.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-primary-address-and-removal.md`
  summary: Flaky under full-suite load: `e2e/profile-phone.spec.ts:324` "axe passes in edit view … with a new row, a struck row and errors" failed once on desktop during the Story 4.4 full run and passed on retry; 8/8 on a repeat run alone. Diagnose from a trace (likely a scan during a transition) before changing the test.
  evidence: Story 4.4 full `CI=1 pnpm test:e2e` run (2026-10-20): 977 passed, 2 flaky (this one and the known `primitives.spec.ts:75`); `--repeat-each=8 --retries=0` on the test alone passed. Story 4.4 doesn't touch Phone.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-view-policies-and-card-images.md`
  summary: Confirm on demo the backend's placeholder values in `GET v2/health/patient/insurance`: a missing Expiration or Cancellation date comes back as `1970-01-01`, and a missing Group ID as `"n/a"`. Story 5.1 shows both as "Not provided", and Story 5.2's editor must load them as empty (or the date-order rules fail on Edit).
  evidence: Found in 1h-ng-bo-core-be (insurance create/update defaults), not seen in a live response yet (user decision 2026-10-20, spec 5.1). If demo returns null instead, the insurance-local sentinel check is harmless but can go.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-add-and-edit-a-policy.md`
  summary: Security/PM, backend — editing an insurance subscriber overwrites another person's 1health profile. On `PUT v2/health/patient/insurance/{id}`, when the subscriber (found by email) has a different name, phone or birth date from the one sent, the backend calls `userService.editUser` on that other user. Any patient can change someone else's profile data this way. Story 5.2 never sends a typed subscriber on Edit: a saved one is locked and re-sent unchanged (decision 2C), and any other non-Self Edit is blocked until the policy is removed and added again (decision 3A); Add (POST) doesn't reach this path. Ask the backend to stop editing the subscriber's own profile from a policy write (or to require that person's consent), and the PM to confirm the intended behaviour.
  evidence: 1h-ng-bo-core-be OneHealthServiceImpl.java:3115-3116 (`editUser` on a differing subscriber), :3136-3160 (subscriber found by email in the default tenant); user decision 2026-10-20, spec 5.2.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-add-and-edit-a-policy.md`
  summary: Security/PM, backend — an insurance subscriber email that matches no 1health person makes the backend create that person and send an invitation email (`userService.invite(…, !skipNotification)`), on behalf of the patient adding the policy. Any patient can make 1health email an arbitrary address. Story 5.2 tells the user ("If {first name} isn't on 1health yet, we'll invite them by email.", DRAFT). Ask the PM to confirm that this is intended and acceptable, and the backend whether it should be rate-limited or confirmed.
  evidence: 1h-ng-bo-core-be OneHealthServiceImpl.java:3173-3218 (invite with notification on no email match); user decision 2026-10-20, spec 5.2.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-add-and-edit-a-policy.md`
  summary: Backend — `POST v2/health/patient/insurance` may return an existing tenant policy with the same insurance company and member ID instead of creating one (`createOrFetchInsurance`), so an "Add" can silently link the patient to someone else's policy record. Story 5.2 just shows what the refetch returns. Ask the backend whether this fetch-or-create is intended for patient adds.
  evidence: 1h-ng-bo-core-be OneHealthRepository.java:2104-2115 (`createOrFetchInsurance`); spec 5.2 Design Notes "Duplicate on POST".

- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-card-image-upload-with-retry.md`
  summary: Test the insurance card delete on demo. Story 5.3 (decision 1A) replaces a card image by uploading the new one and then deleting the old file through the named op `DELETE /api/pp/file/{fileId}`. Every upload adds a new card relation and the policy list shows only the newest, so the op now finds the caller's older card files through a GraphQL lookup of each policy's `InsuranceHasFrontSideCardFile` / `InsuranceHasBackSideCardFile` relations. That query is modelled on the Signature lookup but not verified live. On demo: replace a card image, then check that the old file is gone (no leftover relation). If the delete is refused, the app keeps the new image and fails quietly, so only the leftover would show.
  evidence: 1h-ng-bo-core-be FileServiceImpl.java:1077-1088, 1382-1391 (a new relation per upload), OneHealthRepository.java:2484, 2499 (newest file per side); user decision 2026-10-21, spec 5.3.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-card-image-upload-with-retry.md`
  summary: Backend — deleting a policy removes only its newest front and back card files, so older card files (every upload adds a relation; a failed replace-delete leaves one too) are orphaned. Ask the backend to remove every card relation of a deleted policy.
  evidence: spec 5.3 Design Notes "Policy delete" (1h-ng-bo-core-be AbstractInsuranceDeleteFactory); FileServiceImpl.java:1077-1088 (a new relation per upload).

- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-card-image-upload-with-retry.md`
  summary: (Integrator, T8) Update `docs/FOUNDATION.md` §3.1 Named ops for decision 1A of Story 5.3 — `DELETE /api/pp/file/{fileId}` owns every `InsuranceHasFrontSideCardFile` / `InsuranceHasBackSideCardFile` relation of the caller's policies (the GraphQL card relations lookup, run last and only for policies the list returned), not only the newest card of each side.
  evidence: lib/server/named-ops/file-delete.ts (`cardRelationIds`, `INSURANCE_CARD_FILES_QUERY`). Stories may not edit FOUNDATION (T8).

- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-card-image-upload-with-retry.md`
  summary: (Backend/security) `POST v2/health/patient/insurance` can return an existing tenant policy (`createOrFetchInsurance`), so a patient's card images, and the card-delete ownership of the named op, then apply to a policy record another patient also holds. Ask the backend not to share policy records between patients.
  evidence: 1h-ng-bo-core-be OneHealthRepository.java:2104-2115 (`createOrFetchInsurance`); spec 5.3 review row 14.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-card-image-upload-with-retry.md`
  summary: (Foundation) The PNG/JPEG leading-byte check and the file-size formatting are duplicated in `features/insurance/card-file.ts` and `features/header/picture-file.ts` (features can't import each other). A shared helper (e.g. in `components/ui` next to `image-reencode.ts`) would remove that.
  evidence: features/insurance/card-file.ts (`insuranceCardFileType`, `insuranceChosenFileMeta`); features/header/picture-file.ts (`pictureFileType`, `formatPictureFileSize`); spec 5.3 review row 10.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-card-image-upload-with-retry.md`
  summary: (Foundation) No telemetry events for the card upload, Retry and replace-delete outcomes, so the demo check of the card delete (decision 1A) has no signal. Add events (no ids, no file names) through `lib/shared/telemetry.ts` in a foundation PR.
  evidence: features/insurance/card-upload.ts, card-retry.tsx; lib/shared/telemetry.ts (`TelemetryEvents`); spec 5.3 review row 18.

## Team B (`/account`, Epics 7-10)

- source_spec: none
  summary: Story 7.1 Account page — route, tabs, deep links and states, built on 7.0a + 7.0b. (resolved 2026-10-15, spec-7-1-account-page: `app/account/page.tsx` composes the foundation; tests in `app/account.test.tsx` and `e2e/account-page.spec.ts`)
  evidence: Split from the Epic 7 start (user-approved 2026-10-14); depends on the 7.0a/7.0b foundation specs.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-2-shell-navigation.md`
  summary: The e2e "page switch (clean)" journey goes to a 404 because /account does not exist yet, so its "myself not refetched" assertion proves nothing about the shared SWR cache. (resolved 2026-10-15, spec-7-1-account-page: `/account` is a real page; `e2e/shell.spec.ts` page-switch and leave-guard tests now expect `/account?tab=personal` (human-approved T2 exception), `e2e/account-page.spec.ts` asserts Account `aria-current` and one `myself` request on / → Account, and `app/account.test.tsx` proves / → Account → / issues one `myself` request within SWR's dedupe window)
  evidence: PageNav targets /account; Story 7.1 adds app/account/page.tsx and must assert the shared cache (one /myself request) and Account aria-current on the real page.
- source_spec: `_bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md`
  summary: Confirm publicFilesOrigin (bocore-public-files-{demo,prod}.s3.us-west-1.amazonaws.com, found only in 2022–2023 backend git history) against a live tenantLogo.publicUrl on demo and prod before Story 10.2; SVG tenant logos will always show initials.
  evidence: 1h-ng-bo-core-be history (test-product.ftl, test.html); SimpleStorageService.java:346-353; TenantServiceImpl.java:738.
- source_spec: `_bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md`
  summary: /api/pp/org-logo makes up to 5 membership calls plus an S3 fetch per <img>, with no-store, so a 12-card page can cost ~70 upstream calls per render.
  evidence: lib/server/named-ops/org-logo.ts. Story 10.2 should cache the membership lookup per session (or pass the list's tenant ids) and consider a short private max-age for successful logos.

- source_spec: `_bmad-output/implementation-artifacts/spec-f6-1-page-composition.md`
  summary: (Team B, Story 7.2) e2e no-store assertion for RSC and prefetch requests to `/`, `/account` and `/handoff/**`; and whether pages need `Vary: Cookie` (Next 16 replaces `Vary` on rendered pages with its RSC list).
  evidence: `proxy.ts#isNoStorePath` + `proxy.test.ts` (unit matrix covers navigation, RSC and prefetch); `e2e/headers.spec.ts` asserts navigations only. F6-1 Review Triage Log "Deferred".

- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-account-hardening.md`
  summary: (Integrator documentation) 7.2 verified HTML, RSC navigation and prefetch remain private/no-store with zero max-age; keep Next's rendered-page RSC Vary values rather than forcing a deployment header, and document that rendered responses do not retain the literal Cookie token.
  evidence: Next 16 local CDN-caching guide explains RSC variants; real-page tests in e2e/account-hardening.spec.ts assert AD-18/AD-21, with Cookie additionally asserted on the interceptor's 307 and the disabled 503. This is the technical cache-isolation choice for 7.2; no deployment configuration changed.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-account-hardening.md`
  summary: (Team B, real-read stories starting 7.4) Measure the inherited first-tab meaningful-content target of 1.5 seconds once Account renders real content; placeholder readiness is not a valid performance measurement.
  evidence: Epic 7 context retains the PNFR target; 7.2 tests security, cache and accessibility, while Account business sections are still loading stubs. Define the timing environment and readiness signal when 7.4 adds its read view.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-account-hardening.md`
  summary: (Foundation follow-up from Team B validation) The previously recorded DisabledAction Escape tooltip flake also occurred on desktop during the complete 7.2 e2e run; diagnose independently in a foundation PR.
  evidence: `corepack pnpm exec playwright test --workers=4` → 411 passed, 6 skipped, 1 failed in e2e/primitives.spec.ts:75 on desktop; after Escape, getByRole('tooltip') had count 1 instead of 0. The trace was retained by Playwright. Story 7.2 changes neither the primitive test nor Tooltip/DisabledAction; the focused rerun of primitives plus Account passed (53 passed, 3 mobile-only skips on desktop).

- source_spec: `_bmad-output/implementation-artifacts/spec-7-2-account-hardening.md`
  summary: (Resolved 2026-10-16, Team B) Keyboard-focused tabs are revealed before activation on a 360 px strip; Story 7.2's foundation integration dependency is closed locally.
  evidence: Approved review action R6 exposed clipping in both mobile themes. The user explicitly directed completing local integration before closing the ticket, instead of publishing the prerequisite PR (exception to T2's sequence). Cherry-picked independently reviewed foundation commit `0602f9e41d54d643030814a561ae95f490444ca1` as `aac40e8c2a64877804ddc71a55d3090c977bcce9` onto the story branch. Strict R6 cases and Profile/Account regressions pass; full integrated validation passed 3,585 unit tests (100% enforced coverage) and 442 e2e tests (6 viewport skips), without failures or retries. No remote push, PR or main merge was performed.

### Deferred from: code review of spec-7-4-account-settings-view (2026-10-16)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-4-account-settings-view.md`
  summary: (R5, medium; Team B coordinates with Team A/Foundation) Existing Profile onReady-only consumers must report failure layouts when they can move a later deep-link target; keep this pre-existing integration repair separate from Account Story 7.4.
  evidence: `features/personal/personal-section.tsx:509` still uses onReady, and the caller/guidance are unchanged from the baseline. A production-browser held myself 400 at `/?tab=contacts#phone` moves the desktop Phone heading from y=10 to y=-150; mobile remains y=10. Account already uses onSettled and has success/error/forbidden deep-link coverage. Close with owner-approved integration and a Profile failure-anchor regression.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-4-account-settings-view.md`
  summary: (R10, inherited PNFR acceptance; owner Team B QA/integrator) Complete the existing 1.5-second first-tab demo-broadband measurement before release acceptance; the 7.4 local response-to-ready test is not that measurement.
  evidence: The earlier Team B 7.2 deferred item assigned this check to real-read stories starting 7.4. Use a synthetic demo account, document the broadband profile, measure navigation/tab activation through a ready ten-field table including request latency/hydration, and record <=1,500 ms acceptance evidence. No real-demo latency failure has been established; the spec explicitly marks this environment check pending.

- source_spec: `_bmad-output/implementation-artifacts/spec-8-3-turn-off-the-authenticator-app.md`
  summary: Account follow-up: request a separate foundation fix for ConfirmDialog content clipping in a short viewport with enlarged text; the shared dialog needs a bounded height and reachable scrolling actions.
  evidence: Integrated BMAD review reproduced the pre-existing layout at 600x240 with 200% root text: dialog top -89 / bottom 329, action bottom 280 versus viewport 240, overflow-y visible. Normal text fits at top 25 / bottom 215. Height/overflow styling is unchanged by PR #24 or Story 8.3; any shared fix must ship through foundation. Local evidence: /tmp/story83-short-enlarged-viewport-probe.log.
  resolution: RESOLVED 2026-10-20 — user explicitly authorized the shared fix on feat/NG-9038-disable-authenticator. ConfirmDialog now uses dynamic-viewport bounds/centering, vertical scrolling and wrapping content/actions. Standard/destructive browser regressions at 600x240 and 360x320 with 200% text pass in both themes/projects; see spec-confirm-dialog-short-viewport.md.

## Foundation (shared or cross-team)

- source_spec: none (D18 optional dev environment, 2026-10-15)
  summary: Confirm the dev `publicFilesOrigin`. Dev ships with `null` (every dev org logo 404s → initials). The only candidate is `https://bocore-public-files-develop.s3.us-west-1.amazonaws.com`, seen in 2022 backend mock data for the old dev host; check it against a live `tenantLogo.publicUrl` on `https://dev.1hdev.io` before relying on dev logos (Story 10.2).
  evidence: lib/shared/environments.ts (`dev` config); 1h-ng-bo-core-be `OrderTestResultMockFactory.java` and history of the test-product report template (`bocore-public-files-develop`); no `bocore-public-files-dev` anywhere in config or history.

- source_spec: `_bmad-output/implementation-artifacts/spec-f6-3-data-server-tests.md` (review, 2026-10-14)
  summary: The fixture-page gate test decides whether a page needs a session by a `requirePageSession()` substring in its source, so a page that calls it indirectly (or mentions it in a comment) is checked wrongly.
  evidence: app/test-fixtures.test.ts; replace with an explicit per-page export (e.g. `export const needsSession = true`) or a mock-call count without the source check.
- source_spec: `_bmad-output/implementation-artifacts/spec-f6-3-data-server-tests.md` (review, 2026-10-14)
  summary: The `NPI_ALREADY_REGISTERED` derived error code is dead: since F6-3 the NPI-taken rules map to the `personalNpi` / `practiceNpi` fields, and no rule emits it.
  evidence: lib/api/errors-codes.ts (`DerivedErrorCode`), lib/shared/telemetry.ts; remove it with its telemetry entry once Story 9.2 confirms the field mapping.
- source_spec: none
  summary: 7.0b Shell foundation — features/shell (app bar with non-interactive `primary-text` wordmark, tabs, navigate, leave guard, SectionRegistry, session-expired dialog on the `scrim` token — no session-changed dialog), lib/api/errors.ts, lib/shared/messages.ts, toasts, Retry.
  evidence: Split from the Epic 7 start (user-approved 2026-10-14); Story 7.1 needs Epic 1 pieces 1.7/1.8/1.11/1.12/1.13, too large for one spec. Runs after 7.0a.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`
  summary: Proxy request bodies are buffered before the size check when no Content-Length is sent; needs a streaming byte-capped reader.
  evidence: lib/server/proxy/handler.ts readEntryBody uses request.text(); bounded today by Next/Vercel body limits and no upload entries ship yet (AD-13 upload stories must add the streaming reader).
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`
  summary: Launch exchange errors are classified by substring ("used"/"expired"), so words like "refused" map to LAUNCH_USED.
  evidence: lib/server/launch/exchange.ts classifyExchangeError; same status, retry behavior and user message either way, only the logged errorCode differs; switch to word/structured matching once real upstream error bodies are recorded.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`
  summary: Error logs from guardRoute use a new requestId, so a 500 cannot be correlated with its request line.
  evidence: lib/server/http/guard-route.ts generates its own newRequestId(); fix by creating the id once in guardRoute and passing it into handlers.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`
  summary: Browser refresh call has no client-side timeout; a hung refresh holding the pp-refresh Web Lock would stall waiting callApi calls (unverified, medium if real).
  evidence: lib/api/client.ts runRefresh has no AbortSignal; server side is bounded by fetchWithTimeout and locks release on tab close, so it needs a hung same-origin request to bite. Settle by testing a never-resolving refresh with a mocked lock.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`
  summary: Token lifetimes of 30 s or less would make every proxy call TOKEN_EXPIRED and end the session (unverified, medium if real).
  evidence: lib/server/session/refresh.ts EXPIRY_SKEW_MS = 30 s; real IdP lifetimes are minutes. Settle by recording expires_in from demo/prod; fix by clamping the skew to min(30 s, expires_in/2).
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-1-tokens-messages-errors.md`
  summary: 7.0b-2 Shell navigation — app bar (non-interactive wordmark, page nav, Return to 1health), ARIA tabs pattern, minimal header (initials only, primary phone/email ≥768 px), navigate() + requestLeave/leave guard + SectionRegistry, session-expired dialog with login-intent save, `/` page frame with placeholder tabs.
  evidence: Split from spec 7.0b at the human's request (2026-10-14, size gate); builds on 7.0b-1 (tokens, messages, errors.ts, ConfirmDialog, read states). Decisions already taken: relaunch after expiry always lands on `/` (intent used only for `/` paths); header shows initials only until Story 1.10.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-1-tokens-messages-errors.md`
  summary: ProfilePlaceholder renders its own inline load-error copy for every failure (incl. SESSION_EXPIRED and 403) instead of mapFetchError + ReadStateFor.
  evidence: features/shell/profile-placeholder.tsx is replaced by the page frame in 7.0b-2; its test pins the old behaviour (shell.test.tsx:56-66) and must go with it.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-1-tokens-messages-errors.md`
  summary: No test proves check-forbidden.sh actually invokes check-tokens.sh, so the token gate could be disabled silently.
  evidence: check-forbidden.sh takes no root argument; add one (as check-tokens.sh has) and a fixture test.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-1-tokens-messages-errors.md`
  summary: Token gate misses multi-line JSX links using text-info-strong and rgb()/hsl()/oklch()/named colors in inline styles; nothing forbids text-primary used as text (dark 2.18:1).
  evidence: scripts/check-tokens.sh is line-based; extend with an ESLint rule on className/style when the shell components land (7.0b-2).
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-1-tokens-messages-errors.md`
  summary: Outline button keeps dark:border-input (1.24:1) and Input's invalid border uses --destructive (4.10:1) instead of the D13 control-border / error-strong boundary.
  evidence: components/ui/button.tsx, input.tsx; DESIGN.md control-border covers Input, Select and Jump to — decide the button boundary with the 7.0b-2/7.5 controls.
- source_spec: `_bmad-output/implementation-artifacts/1-1-foundation-environment-config-security-headers-test-tooling.md`
  summary: AGENTS.md is auto-generated by `next dev` (Next 16) (resolved 2026-10-14: AGENTS.md is tracked and carries the shared-foundation pointer outside the `nextjs-agent-rules` markers).
  evidence: Appears in the review diff only because staging used `git add -N` on all untracked files; the Implementation Note says it was left untracked. Fix touches an agent-context file, so deferred.
- source_spec: `_bmad-output/implementation-artifacts/1-1-foundation-environment-config-security-headers-test-tooling.md`
  summary: Add a `.env.example` documenting the new required/optional env var contract (APP_ENV, APP_ORIGIN, APP_ID, ONEHEALTH_SECRET_KEY, SESSION_SECRET, SESSION_SECRET_PREVIOUS, PLACES_ENABLED, GOOGLE_PLACES_KEY, PP_DISABLED). (resolved 2026-10-14, spec R5-2: `.env.example` documents the D1 contract: the _DEMO/_PROD keys and app ids, SESSION_SECRET(_PREVIOUS), PP_DISABLED, ACCOUNT_DISABLED, PP_E2E_FIXTURES, PLACES_ENABLED, GOOGLE_PLACES_KEY)
  evidence: The old *_DEMO/*_PROD vars were removed from code but nothing documents what a developer must now set. Real developer-onboarding gap; not a spec task for Story 1.1.
- source_spec: `_bmad-output/implementation-artifacts/1-1-foundation-environment-config-security-headers-test-tooling.md`
  summary: Update stale docs (README.md, CLAUDE.md, docs/AUTH-ARCHITECTURE.md, docs/api/CONVENTIONS.md, docs/README-DEBUGGER.md, docs/ACTION-PATTERNS.md) that still describe the deleted auth-client, /api/token, /auth, legacy lib/api engines, and *_DEMO/*_PROD env vars. (resolved 2026-10-14, spec R5-2: CLAUDE.md, AGENTS.md and README describe the BFF (`/auth` + `/api/token` LPL launch, sealed session, `callApi`, D1 _DEMO/_PROD env) since spec 7.0a; `docs/AUTH-ARCHITECTURE.md` was rewritten for the BFF)
  evidence: These docs now describe code that no longer exists after the Story 1.1 legacy removal. Fix edits agent-context files (CLAUDE.md) and broad docs; deferred.
- source_spec: `_bmad-output/implementation-artifacts/1-1-foundation-environment-config-security-headers-test-tooling.md`
  summary: Verify the CI pnpm cache ordering (actions/setup-node `cache: pnpm` immediately after `corepack enable`) actually resolves pnpm on the first GitHub Actions run; if not, add pnpm/action-setup before setup-node. (resolved 2026-10-14, spec R5-2: CI restores `cache: pnpm` in main's order: `corepack enable` before `setup-node`, then again for Node 24; watch the first run)
  evidence: maybe-false, medium-if-true (would break the CI gate AC). Cannot be verified without a GitHub Actions runner; local runs don't exercise setup-node caching. Settle by watching the first CI run.
- source_spec: `_bmad-output/implementation-artifacts/1-1-foundation-environment-config-security-headers-test-tooling.md`
  summary: Make the 404 page carry the per-request CSP nonce — `/_not-found` is statically prerendered so under `'strict-dynamic'` its scripts are un-nonced and won't hydrate.
  evidence: Observed in the Story 1.1 production build (`/_not-found` shown as static). Low harm for a placeholder 404 (HTML + security headers are correct; only JS hydration is blocked), same class as the home-page bug fixed in 1.1. Revisit when real routes are added (e.g. force the root layout/not-found dynamic or supply a custom not-found).
- source_spec: `_bmad-output/implementation-artifacts/1-2-launch-from-the-portal-and-arrive-signed-in.md`
  summary: Story 1.5 (token refresh) must consult `accessTokenExpiresAt` in the session guard and reject/replace a non-positive `expires_in` from the exchange (currently a missing `expires_in` seals an already-expired token, harmless in 1.2 since expiry is never read).
  evidence: Raised by blind-hunter + edge-case review of Story 1.2; expiry consumption is explicitly out of scope for 1.2 (refresh = Story 1.5).
- source_spec: `_bmad-output/implementation-artifacts/1-2-launch-from-the-portal-and-arrive-signed-in.md`
  summary: Consider a shared deadline for the launch exchange — `exchangeCode` and `fetchIds` each use a 25s timeout, so a double-slow upstream can take ~50s and may exceed the serverless function's maxDuration, never rendering the error screen.
  evidence: blind-hunter review of Story 1.2. Low/maybe-false; settle against the deployed function's maxDuration.
- source_spec: `_bmad-output/implementation-artifacts/1-3-secure-1health-proxy-allowlist-normalization-csrf-no-store-a.md`
  summary: Proxy upstream timeout covers only time-to-headers; a stalled body stream after headers has no deadline. Add a streamed-body deadline (TransformStream/abort) so a hung upstream body can't tie up the function.
  evidence: blind-hunter + edge-case review of Story 1.3. Low/maybe-false, medium-if-true; fix needs streaming-deadline plumbing beyond a trivial change.
- source_spec: `_bmad-output/implementation-artifacts/1-3-secure-1health-proxy-allowlist-normalization-csrf-no-store-a.md`
  summary: Dev-only redactBody (lib/server/log.ts) misses some secret field names (code, oneTimeCode, apiKey, authorization). Expand the field list when the debug logger is next touched.
  evidence: blind-hunter review of Story 1.3. Dev-only logging; low severity.
- source_spec: `_bmad-output/implementation-artifacts/1-4-callapi-transport-swr-keys-and-usemyself.md`
  summary: CLAUDE.md still describes `callApiRaw`, `authFetch` and the legacy client-side auth design; update it to the AD-19 `callApi` transport. (resolved 2026-10-14, spec R5-2: CLAUDE.md describes the AD-19 `callApi` transport; `callApiRaw`/`authFetch` are gone from it)
  evidence: Story 1.4 removed `callApiRaw`; CLAUDE.md is an agent-context file, so its edit is deferred rather than patched.
- source_spec: `_bmad-output/implementation-artifacts/1-4-callapi-transport-swr-keys-and-usemyself.md`
  summary: Decide in Story 1.7 whether `session-events.subscribe` should replay an event already published before the subscriber registered.
  evidence: Unverified (medium if true) — `publish` is once-per-lifetime, so a subscriber added after the first publish never hears it; today responses arrive after commit, so effect-time subscription likely wins. Settle with a test where a 409 resolves before SessionDialogs mounts.
- source_spec: `_bmad-output/implementation-artifacts/1-5-client-coordinated-token-refresh.md`
  summary: Verify `client_id=public-client` against the real IdP with one refresh on demo; a wrong client id makes every refresh end the session (IdP 401 `invalid_client` maps to `SESSION_EXPIRED`).
  evidence: maybe-false, high if wrong. The refresh request shape comes from the pre-Story-1.1 client code; the launch exchange uses a different (external-application) endpoint, so the pairing is unproven.
- source_spec: `_bmad-output/implementation-artifacts/1-5-client-coordinated-token-refresh.md`
  summary: Concurrent IdP refreshes (no `navigator.locks`, lock fallback, overlapping normal/forced slots) or a relaunch mid-refresh can let a stale `Set-Cookie` (clear or re-seal) overwrite a newer cookie.
  evidence: maybe-false, medium if true — needs IdP refresh-token rotation with reuse detection and a browser path without Web Locks. Settle by confirming the IdP's rotation policy.
- source_spec: `_bmad-output/implementation-artifacts/1-5-client-coordinated-token-refresh.md`
  summary: Make `lib/server/proxy.test.ts` use the real `ACCESS_TOKEN_SKEW_MS` instead of mocking it, so proxy/refresh-route agreement on the skew is tested. (resolved 2026-10-14, spec R5-2: the path is stale: the proxy is `lib/server/proxy/handler.ts`, and `handler.test.ts` uses the real session constants (no skew mock))
  evidence: The proxy test mocks `@/lib/server/session` with a literal 30_000; a drifted proxy constant would pass and force an IdP refresh on every call in the drift window.
- source_spec: `_bmad-output/implementation-artifacts/1-5-client-coordinated-token-refresh.md`
  summary: CLAUDE.md still says "Token refresh is not built yet (Story 1.5)"; describe `/api/session/refresh` and callApi's refresh/replay. (resolved 2026-10-14, spec R5-2: CLAUDE.md's Auth flow describes `/api/session/refresh` and callApi's single-flight refresh + replay)
  evidence: Agent-context file, deferred per workflow.
- source_spec: `_bmad-output/implementation-artifacts/1-6-idle-logoff-activity-ping-and-cross-tab-activity.md`
  summary: A refresh re-seal writes back the `lastSeen` it read, so activity recorded during the IdP call (≤ 25 s) can be rolled back; the server may expire up to ~25 s before the client deadline.
  evidence: Single-cookie last-write-wins (AD-1/AD-16); the client warning still shows first. Fix needs a merge-on-write design (e.g. separate activity cookie or max-merge).
- source_spec: `_bmad-output/implementation-artifacts/1-6-idle-logoff-activity-ping-and-cross-tab-activity.md`
  summary: `callApi` marks every non-GET as user activity; any future POST-based read polled by SWR (query/grid endpoints) would keep the session alive forever.
  evidence: Spec/epic-mandated today and only `GET /myself` is allowlisted; stories adding POST reads must make them non-activity (e.g. a `userInitiated: false` override).
- source_spec: `_bmad-output/implementation-artifacts/1-6-idle-logoff-activity-ping-and-cross-tab-activity.md`
  summary: PM copy question — an idle/absolute logoff found on reload redirects to `/launch-error?reason=expired`, which reads "This link has expired". (resolved 2026-10-14, spec R5-2: D1 removed `/launch-error`; an expiry found on reload redirects to `/auth`, and the open page shows the session-ended dialog)
  evidence: `reason=expired` copy is locked in EXPERIENCE.md and launch-oriented; while the page is open Story 1.7's "Your session ended" dialog covers the case.
- source_spec: none
  summary: Story 1.8 part B — profile page shell: app bar with framed-aware "Return to 1health", Contacts/Insurance/Medical tabs with `?tab=` replace + `requestLeave()`, numbered Section menu / "Jump to" with scroll-spy and `#<section>`/`#signature` deep links, `SectionFrame` loading/error states, Insurance and Medical placeholders, 360 px and axe (light/dark) checks. (resolved 2026-10-14, spec R5-2: built by specs 7.0b-2 (app bar, tabs, page frame) and F3-3 (section menu, Jump to, scroll-spy, deep links, panels))
  evidence: Split from Story 1.8 at the multi-goal check (user chose "tokens first"); part A (design tokens, DESIGN.md overrides, dark values, hex/palette lint gate) ships first because B's light/dark axe contrast scans depend on A's colors.
- source_spec: `_bmad-output/implementation-artifacts/1-8a-design-tokens-overrides-and-color-lint.md`
  summary: The destructive Badge and destructive Toast put white text on `bg-destructive` #d84f45 (4.10:1, below AA); the toast close icon at 70 % is about 2.75:1. Move them to `destructive-fill` (or a soft recipe) when a caller first uses them.
  evidence: Pre-existing (the old `text-red-300` close icon was worse); neither variant has an in-app caller yet. Medium when used.
- source_spec: `_bmad-output/implementation-artifacts/1-8a-design-tokens-overrides-and-color-lint.md`
  summary: The destructive Button's focus ring is `focus-visible:ring-destructive/20` (dark `/40`), below the 3:1 non-text contrast a focus indicator needs.
  evidence: Pre-existing, medium. Story 1.8 part B's focus-ring criterion covers every interactive element, so fix it there.
- source_spec: `_bmad-output/implementation-artifacts/1-8a-design-tokens-overrides-and-color-lint.md`
  summary: DESIGN.md is stale against Story 1.8a. Its prose says links map to `text-info-strong` and the destructive button to `bg-error-strong` (the app uses `link-text` / `destructive-fill`), and `drawer-scrim` has no dark value (the app uses black at 60 %). Update it after PM/design review of the dark scrim.
  evidence: DESIGN.md lines 483-484, 545-546 and 598. It is a planning/UX document, so it is deferred rather than edited in a code story.
- source_spec: `_bmad-output/implementation-artifacts/1-8a-design-tokens-overrides-and-color-lint.md`
  summary: Nothing tracks the follow-ups that `globals.css` promises: reporting the three contrast deviations upstream to the 1health design-system owners, and PM/design review of the dark scrim (black at 60 %). Give each an owner and a ticket.
  evidence: The only record is the comment in `app/globals.css` and `docs/DESIGN-SYSTEM.md`; there is no Jira ticket or owner.
- source_spec: `_bmad-output/implementation-artifacts/1-8a-design-tokens-overrides-and-color-lint.md`
  summary: The new CLAUDE.md design-system line says to use the override tokens "where DESIGN.md calls for them" without locating DESIGN.md. Point it at the "Contrast overrides" table in `docs/DESIGN-SYSTEM.md` instead.
  evidence: The section links `docs/DESIGN-SYSTEM.md`, but DESIGN.md lives under `_bmad-output/planning-artifacts/ux-designs/…`. Agent-context file, deferred per workflow.
- source_spec: `_bmad-output/implementation-artifacts/1-8b-profile-page-shell-app-bar-tabs-and-section-navigation.md`
  summary: `SectionFrame`'s loading state isn't announced to screen readers (only `aria-busy`, and the skeleton rows are `aria-hidden`). Design a non-noisy announcement (e.g. one polite page-level status) in the Section framework.
  evidence: `aria-busy` support is poor; five Sections loading at once means one per-Section announcement each is too noisy. Story 1.11 owns `SectionFrame`'s full contract.
- source_spec: `_bmad-output/implementation-artifacts/1-8b-profile-page-shell-app-bar-tabs-and-section-navigation.md`
  summary: `Input`, `Badge`, and the session-dialog / idle-warning action buttons still use `ring-*` focus styles, the latter on top of Button's `focus-ring`. Migrate them to `focus-ring` and make the CLAUDE.md / DESIGN-SYSTEM.md wording ("every interactive control") true.
  evidence: The part B spec told the implementer to leave the dialog classes alone. The doc claim covers more than the code, and one fix edits an agent-context file.
- source_spec: `_bmad-output/implementation-artifacts/1-8b-profile-page-shell-app-bar-tabs-and-section-navigation.md`
  summary: The deep-link scroll runs once at mount, and the scroll-spy observes only the Sections present when it starts. When header data (`MyselfName`, Story 1.9) or Section content (1.11) changes the layout, re-follow the hash and observe late Sections.
  evidence: The layout shifts after the initial scroll and moves `#signature`/`#<section>` targets. It is harmless while every Section is a fixed-height skeleton.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: "Owner question (D9 / Story 1.2): a lost success response followed by a retry wipes the just-created session. Attempt 2 gets LAUNCH_USED, and the mandated clear-first deletes the new cookie, so the user sees 'This link has expired'. Option: on LAUNCH_USED, keep an existing valid session for the same user and environment."
  evidence: Conflicts with Story 1.2's frozen clear-first and used→400 rules. The user chose to defer it to the epic owner on 2026-10-14. Rare (needs a dropped response) and recoverable by relaunching.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: "Owner security question (D9): login CSRF. Any site can link to /auth?lpl=<attacker's own payload>; the screen auto-launches and signs the victim into the attacker's account, where they may enter health data. Option: require a 'Continue' click when the referrer isn't a 1health portal host."
  evidence: D9 mandates auto-start, and D5 already accepts no CSRF checks. The one-time code's short validity narrows the window but doesn't close it. The user chose to defer it to the epic owner on 2026-10-14; record it next to the D5 trade-offs.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: "Owner question (Story 1.2): LAUNCH_USED, LAUNCH_EXPIRED, LAUNCH_CONFIG and SERVICE_DISABLED carry no retryable:false, so /auth makes four more doomed attempts (~6 s) before showing the error. Option: mark them retryable:false."
  evidence: Story 1.2 says exchange failures carry no retryable:false. The user chose to defer it to the epic owner on 2026-10-14.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: After a successful exchange, a failed launch (WRONG_TENANT, a /myself failure or mismatch, a seal fault) drops live tokens without revoking them. Design a single-token best-effort revoke; all-devices (D3) would sign the user out everywhere.
  evidence: The pre-R1 /launch had the same gap. It needs a revoke endpoint choice, which is a backend question alongside the earlier refresh-token request.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: /api/token error bodies omit the detected environment, so a demo user with no referrer or onehealth_environment cookie gets "Go to 1health (Production)" on the error screen. Consider adding environment to post-detection error bodies.
  evidence: Story 1.2 fixes the error-body fields, and the environment is not secret.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: CLAUDE.md lists ACCOUNT_DISABLED as a kill switch; add that it is parsed only until the Story 1.3 rework (R2) enforces it. (resolved 2026-10-14, spec R5-2: ACCOUNT_DISABLED is enforced (`lib/server/kill-switch.ts`, root `proxy.ts`, the `/disabled` screen), so "parsed only" no longer applies)
  evidence: .env.example and README were patched; CLAUDE.md is an agent-context file, deferred per workflow.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: "For R3: saveLoginIntent has no caller yet; requireSession() and the root proxy.ts expiry redirect drop ?tab= until R3 saves the intent; saveLoginIntent should store pathname + search without the hash (epics.md:1151)." (resolved 2026-10-14, spec R5-2: `features/shell/session-dialog.tsx` saves pathname + search (no hash) before Return to 1health; `/auth` consumes it)
  evidence: The R1 spec assigns saving the intent to Story 1.7 (R3).
- source_spec: none
  summary: Login CSRF on /auth (auto-launch of any lpl in the URL) — resolved as accepted risk.
  evidence: Human decision 2026-10-14 (recorded on D9 in epics.md): keep patient-vault behaviour, no "Continue" step for non-1health referrers.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0c-1-idle-logoff-and-activity.md`
  summary: 7.0c-2 Section navigation — port main Story 1.8B (Section menu, Jump to on components/ui/select.tsx @radix-ui/react-select 2.3.7, scroll-spy, deep links incl. #signature, SectionFrame with MappedError-driven states, Contacts/Insurance panels) into PageTabs; section jumps bypass requestLeave; load-error copy "Couldn't load {section}" with the EXPERIENCE plural nouns.
  evidence: Split from 7.0c at the human's request (2026-10-14, three specs); main code at commit b005536.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0c-1-idle-logoff-and-activity.md`
  summary: 7.0c-3 Disabled screen — port main's DisabledScreen for PP_DISABLED on / and /auth (and ACCOUNT_DISABLED on /account later, Story 7.2), environment from session/cookie/referrer, DISABLED_MESSAGES draft copy, 503 via root proxy.ts if Next 16 allows (else 200, deferred).
  evidence: Split from 7.0c at the human's request (2026-10-14, three specs); main code at commit b005536.
- source_spec: none
  summary: Former queued specs 7.0c-2 (section navigation) and 7.0c-3 (disabled screen) are absorbed into the shared foundation F3 and F2.
  evidence: Human approved shared-foundation-plan.md on 2026-10-14.
- source_spec: `_bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md`
  summary: No per-session throttle on /api/places/autocomplete (paid Google calls) or /api/pp/mfa/validate (6-digit code guessing relies on upstream lockout, not confirmed in MfaResource).
  evidence: Serverless in-memory limits are per instance; decide with Stories 4.3 (Team A) and 8.2 (Team B): confirm upstream TOTP lockout on demo, add a sealed-session attempt counter or edge rate limit if absent.
- source_spec: `_bmad-output/implementation-artifacts/spec-f5-1-select-date-input-popover.md`
  summary: With a Radix Select listbox open, axe `aria-hidden-focus` flags the page: Radix Select (the F3-1 port, `@radix-ui/react-select` 2.3.7) hides the rest of the page with `aria-hidden` while trapping focus, without `aria-modal`. Library behaviour; the e2e scans only the listbox in that state.
  evidence: `e2e/inputs.spec.ts` (comment at the open-listbox axe scan); F5-1 Review Triage Log "Deferred". Revisit on a Radix Select upgrade, or patch the content with `aria-modal="true"` if axe still flags it; feature e2e that scan with an open Select (2.2, 4.2, 5.2, 7.5, 7.6) scan only the listbox too.
- source_spec: `_bmad-output/implementation-artifacts/spec-f6-2-shared-ui-kit.md` (review, 2026-10-14)
  summary: Full-screen dialog (8.2 QR) and Sheet (5.2 mobile page) pin their footer to the layout viewport; with the on-screen keyboard open the footer may sit under it on iOS. Decide `interactive-widget=resizes-content` in the viewport meta or a visual-viewport offset.
  evidence: components/ui/dialog.tsx (`fullScreenOnMobile`, `h-dvh`), components/ui/sheet.tsx; e2e checks the pinned footer without a keyboard only.
- source_spec: `_bmad-output/implementation-artifacts/spec-f6-2-shared-ui-kit.md` (review, 2026-10-14)
  summary: `useAnnounce` re-announces identical text by toggling a trailing no-break space (the F5-2 combobox rule); verify with VoiceOver and NVDA that the repeat is read.
  evidence: components/ui/live-status.tsx; unit test asserts the DOM change only.
- source_spec: `_bmad-output/implementation-artifacts/spec-f7-2-contract-hardening.md` (review, 2026-10-14)
  summary: CLOSED — file deletes no longer trust the client's id. The backend's `DELETE v2/file/{id}` checks only the tenant, so the proxy denies `DELETE v2/file/**` and Stories 1.10, 2.4 and 5.3 delete through the named op `DELETE /api/pp/file/{fileId}` (`fileDeletePath`), which proves with the session's token that the id is the caller's profile picture, Signature or one of their insurance cards before hard-deleting; anything else is 404 `NO_FILE`. Still open (backend follow-up, Team A item above): hard delete may leave private S3 objects.
  evidence: lib/server/named-ops/file-delete.ts, app/api/pp/file/[fileId]/route.ts, lib/server/proxy/deny-list.ts, lib/api/files.ts#fileDeletePath.

- source_spec: `_bmad-output/implementation-artifacts/spec-ng-9027-foundation-tests-safeguard.md`
  summary: Accepted limit of the D-A save safeguard (human decision 2026-10-15). Reads are not checked, so user A's open tab can show user B's data, after B launches in the same browser, until A tries to save. Only writes are stopped.
  evidence: The check runs before writes in `callApi` and once per `runSaveAll` batch; nothing revalidates the user on reads.
- source_spec: `_bmad-output/implementation-artifacts/spec-ng-9027-foundation-tests-safeguard.md`
  summary: Accepted limit of the D-A save safeguard (human decision 2026-10-15). A launch in the other environment (demo vs prod) whose user id happens to match the pinned page user is not caught.
  evidence: The pin and the check compare `myself.id` only. `/myself` does not return the environment, and ids are not environment-scoped.
- source_spec: `_bmad-output/implementation-artifacts/spec-ng-9027-foundation-tests-safeguard.md`
  summary: Accepted limit of the D-A save safeguard (human decision 2026-10-15). There is a short window between the `/myself` check and the write: per write, or across a whole Save-all or leave-guard batch, which checks once. While a batch runs, its single check also covers any other write the page sends (the bypass is page-wide).
  evidence: The check and the write are separate requests, and the batch check is deliberate, to avoid one extra request per Section. Browsers have no async context to scope the bypass to the batch's own calls, so it is a page-wide flag (`pageUser.runVerified`, spec NG-9027 review #2).
- source_spec: `_bmad-output/implementation-artifacts/spec-ng-9027-foundation-tests-safeguard.md`
  summary: (Integrator, T8) Document the D-A save safeguard: FOUNDATION §3.2 Transport/Session events (`checkPageUser` also publishes `session-expired`; one fresh `myself` GET per data write, one per `runSaveAll` batch; `pageUser` pin/runVerified; the drafts owner is the pinned page user) and §6 (replace the D5 point 3 accepted risk with D-A and its three accepted limits); AUTH-ARCHITECTURE "no session binding (D5)" with the D-A mitigation; CLAUDE.md/AGENTS.md transport line.
  evidence: The spec forbids story/foundation-PR edits to agent-context docs (T8); review finding #11.
- source_spec: `_bmad-output/implementation-artifacts/spec-ng-9027-foundation-tests-safeguard.md`
  summary: (Foundation shell bug, pre-existing) On a dirty page, Enter or Space on a tab opens the leave dialog and the same key press activates the initially focused "Keep editing", so the dialog closes at once and the tab never changes by keyboard. A pointer click works.
  evidence: Reproduced in Playwright while building spec NG-9027 (its e2e uses a pointer click for the tab trigger). WCAG 2.1.1 (keyboard) risk; fix in `features/shell/page-tabs.tsx` / `leave-guard.tsx` (e.g. act on keyup or defer focus).

### Deferred from: code review of spec-7-0a-bff-foundation-and-tooling (2026-10-14)

- Upstream 401 on a clock-fresh access token ends the session instead of forcing a refresh (Story 1.5 L1050/L1067 behaviour); revisit with a force-refresh flag when 1.6/7.0b touch refresh.
- `/api/token` (and the proxy) buffer chunked request bodies without Content-Length before the size cap; bounded by Next/Vercel limits, add a streaming byte-capped reader with the AD-13 upload stories.
- `fetchWithTimeout` now caps body streaming at 25 s, which would cut future large `asImage` downloads; switch to an idle timeout when the first `asImage` entry ships.
- Proxy deny check runs on client segments before owner-id substitution; re-run it on upstream segments when the first `{userId}`/`{personId}` entry is added.
- A relaunch over an existing session drops the previous tokens without revoking them; add a best-effort `revokeAllDevices` for the replaced session.

### Deferred from: code review of spec-r5-1-main-parity-server-e2e (2026-10-14)

- `/api/token` fail-closed path: a throw after the exchange (e.g. in the seal or `environmentSetCookie`) answers 502 but does not revoke the just-issued tokens (the over-budget seal path does). Revoke best effort there too, and align the R5-1 matrix wording for seal throws.
- `test/e2e-upstream-mock.ts` matches a 1health root by string prefix (`<root>/`); match by parsed origin instead.
- `isOpaqueRedirect()` treats any status 0 as an opaque redirect; narrow it to `type === "opaqueredirect"` if another status-0 shape ever appears.
- Refresh: a 400 body is read with `response.json()` without a byte cap; read it through the capped reader.
- The e2e mock revokes per Bearer token (intentional: parallel e2e runs share one server); revisit only if a test needs all-devices semantics.
- `playwright.config.ts` `reuseExistingServer` is on locally, so a stale server (other env, e.g. without `PP_E2E_MOCK`) can be reused; consider a port/env check.
- The 360 px shell test reads gutters through structural selectors (`body header > :first-child`, `#personal` parent, the combobox parent); give those containers test-stable hooks.

### Deferred from: code review of spec-r5-2-main-parity-client-tooling (2026-10-15)

- The fetch lint ban misses `window["fetch"]` (computed member) and a bare `fetch` reached through an alias (`const f = fetch; f(…)` or `const { fetch: f } = globalThis`); extend the selectors or add a scope-aware rule like `pp/inline-swr-key`.
- `callApi` answers `NETWORK_ERROR` for invalid caller headers, which `isTransientReadFailure` counts as transient, so a `myself` read with bad headers would be retried 3 times; give it its own code (e.g. `BAD_HEADERS`) if a read ever passes caller headers.
- CI `cache: pnpm` with `corepack enable` before `setup-node` (and again for Node 24) is unconfirmed until the first GitHub Actions run; if `pnpm store path` fails there, add `pnpm/action-setup` before `setup-node`.
- Move `test/page-session.test.ts` next to `lib/server/session/session.test.ts` once R5-1 and R5-2 are merged (it sits in `test/` only because `lib/server/**` was frozen for R5-2).

### Deferred from: code review of spec-7-1-account-page (2026-10-15)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-1-account-page.md`
  summary: (Team B) `/account?lpl=x` with a session keeps `lpl` in the address bar/history after tab normalization; consider dropping it with the same replace.
  evidence: AC 7.1 only requires that `lpl` is ignored (no exchange); the code is single-use, so this is hygiene, not a leak of a usable credential.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-1-account-page.md`
  summary: (Team B) add page-level e2e on `/account` for a non-403 read failure with per-frame Retry, a `myself` failure (page banner vs `useClaimMyselfError`) and session expiry, once Stories 7.4/8.1/9.1/10.1 add real reads.
  evidence: the stubs make no reads today; the behaviour is unit-tested in the foundation (`state-frame`, `page-frame`, `session-dialog`).


### Deferred from: CI flake triage on feat/NG-9019-story-7-1 (2026-10-15)

- source_spec: `_bmad-output/implementation-artifacts/spec-f3-1-ui-primitives-and-toasts.md`
  summary: (Foundation) `e2e/primitives.spec.ts` "DisabledAction … Escape" is flaky on `mobile-360` (2/35 local runs): after a forced tap on the DisabledAction and Escape, the reason tooltip stays open (`toHaveCount(0)` gets 1). Likely an interaction between the tap toggle (`openAtPressRef`), `keepOpenOnPress` and the focus-open in `components/ui/tooltip.tsx`; diagnose with a Playwright trace before changing the component.
  evidence: `pnpm exec playwright test e2e/primitives.spec.ts --repeat-each=5 --workers=2` → 2 failed / 68 passed, both at the final `toHaveCount(0)` on mobile-360; desktop never fails.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-view-personal-information.md`
  summary: (Foundation) Export the `#signature` loading anchor (`SignaturePlaceholder` in `features/shell/placeholders.tsx`, unexported) so Personal information can reuse it instead of its own `SignatureAnchor` copy.
  evidence: Story 2.1 review finding 8: `features/personal/personal-section.tsx` re-creates the placeholder row (label + pulse bar) because the shell doesn't export it; story PRs can't edit `features/shell` (T2).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-edit-and-save-personal-information.md`
  summary: Foundation — `DateInput` can't show partial text from outside, so a Personal draft holding a partial Birth date (e.g. "04/1"), or a partial date kept across the 768 px edit-table remount, shows an empty input while the form holds the text and Save reports the format error.
  evidence: components/ui/date-input.tsx seeds its text from `wireToDisplayDate(value)` only; features/personal/personal-section.tsx `BirthDateControl` holds the shown text in the form. Fix: an optional `text`/`defaultText` prop on DateInput (foundation PR).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-edit-and-save-personal-information.md`
  summary: Foundation — `Combobox` has no read-only mode: while the Personal information save is in flight the Gender identity list still opens and the input has no `aria-readonly` (changes are already ignored by the Section).
  evidence: components/ui/combobox.tsx has no `readOnly` prop; features/personal/personal-section.tsx `GenderIdentityControl` guards `onTextChange` only. Fix: an additive `readOnly` on Combobox (foundation PR).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-signature.md`
  summary: Foundation — the read-view `SignatureThumb` shows a Signature (dark ink on a transparent PNG, the paper-pad decision of 2026-10-16) on `bg-background`, which is graphite in dark mode, so the ink is hard to see there. Give the thumbnail a theme-constant paper background, and add a generic paper-surface token instead of the pad reusing `qr-surface`.
  evidence: features/shell/signature-thumb.tsx (`bg-background`); features/personal/signature-pad.tsx (`bg-qr-surface`, `--graphite` ink, `--slate` cue and baseline); app/globals.css `--qr-surface`. Story 9.3 reuses the thumbnail.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-signature.md`
  summary: Foundation — `SaveError.failedParts` is typed `readonly AccountSavePart[]` (`/account` parts only), so a `/` Section can't return its `runSaveSteps` `failedParts` from `save()` for `describeError`. Personal information keeps the last save's failed parts in a Section ref and reads it in `describeError`. Widen the type additively (e.g. `readonly string[]`, or a union with the Profile parts) in a foundation PR.
  evidence: features/shell/nav-types.ts (`SaveError`); features/personal/personal-section.tsx (`failedParts` ref).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-signature.md`
  summary: (Integrator, T8) Update `docs/FOUNDATION.md` for Story 2.4 — remove the `POST v2/file/{fileId}/version` entry from §3.1 (Allowlist areas row: "signature upload + `v2/file/{fileId}/version`") and from the §5 Story 2.4 row ("signature upload + version entries", "take the version id only from `myself.signature`"); in §6 Team A drop "Signature-version … ids come from the client" (a replace is now upload to `me` + the ownership-checked delete); and in §3.1 Named ops note that `DELETE /api/pp/file/{fileId}` owns every `PersonHasSignatureFile` relation of the caller (the GraphQL relations lookup, foundation a0c01dc), not only `myself.signature`.
  evidence: docs/FOUNDATION.md §3.1, §5, §6; lib/server/proxy/allowlist/personal.ts (no version entry); lib/server/named-ops/file-delete.ts (`signatureRelationIds`). Stories may not edit FOUNDATION (T8).

### Deferred from: CI failure triage on feat/NG-9023-epic-3 (2026-10-16, CI run #53)

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-verify-phones.md`
  summary: (Foundation) When a jsdom test times out in the middle of an `await act(async …)`, React's act scope stays open, and every later `renderInPage` in that file throws "renderInPage: the Section registry was not mounted". That message hides the real cause, the timeout. Run #53 showed 3 timeouts and 24 misleading failures. Options: make `renderInPage`'s message name a likely earlier timeout or unflushed `act`, and/or raise the client project's `testTimeout` in `vitest.config.ts` for full Section flows on CI runners. Story 3.3 instead set `vi.setConfig({ testTimeout: 20_000 })` in its two heavy Phone test files.
  evidence: `pnpm vitest run --project client features/contacts/phone-section.verify.test.tsx --testTimeout=1000` at 705668d gives 1 timeout and 21 "registry was not mounted" failures; `test/providers.tsx:112`.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-manage-social-media-links.md`
  summary: (Foundation) Gate `target="_blank"` in `scripts/check-forbidden.sh`: allow it only in `features/contacts/social-section.tsx` (the AD-5 exception for external social links, Story 3.7), so a portal or 1health destination can never open a new tab unnoticed.
  evidence: Story 3.7 AC ("no portal or 1health destination anywhere in the app uses target=_blank") is checked only by a one-off search today; review row 14 of spec 3.7.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-view-addresses.md`
  summary: (Foundation) `SectionTable`'s stacked card prints a screen-reader "{header}: " prefix for every line-2 column, even when the cell is empty, so a plain address reads "Label: Type: Home Status:" (and an Email Home row an empty "Status:"). Skip the prefix when the cell renders nothing.
  evidence: features/shell/section-table.tsx (mobile card, `sr-only` header prefix); review row 6 of spec 4.1.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-address-suggestions-via-server.md`
  summary: (Foundation) `Combobox` needs `autoComplete` and `readOnly` props. The address line 1 combobox hardcodes `autoComplete="off"` (a WCAG 1.3.5 regression for the user's own address) and has no read-only state for a saving Section; Story 4.3 sets both on the input through its ref as a Team A workaround.
  evidence: components/ui/combobox.tsx (the input's `autoComplete="off"`); features/addresses/addresses-section.tsx (`AddressLine1Field` effect). Review rows 4 and 15 of spec 4.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-address-suggestions-via-server.md`
  summary: (Foundation) Under `next dev`, `logApiCall` prints request and response bodies; `redact()` in `lib/api/log-api-call.ts` doesn't cover the Places `input`, `placeId` or address fields, so typed addresses reach the browser console in local development. Add those keys to the redaction.
  evidence: lib/api/log-api-call.ts (`redact`), lib/api/client.ts; review row 14 of spec 4.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-primary-address-and-removal.md`
  summary: (Foundation) `toastError` always shows Retry (`ToastErrorOptions.onRetry` is required), so the Addresses "removed elsewhere" toast after Make primary offers a Retry that only reloads the list. Add an option for an error toast without Retry (or with a custom action label).
  evidence: features/shell/toasts.ts; features/addresses/addresses-section.tsx (`sendMakePrimary`, `refreshAddresses`). Spec 4.4 asked for no Retry there; review row 20.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-primary-address-and-removal.md`
  summary: (Foundation) `Tooltip` has no `disabled`/`open={false}` option, so the Addresses "Set as primary" checkbox stays wrapped in an always-mounted Tooltip with empty, hidden content while unlocked (to avoid a remount that loses focus). Add an option and drop the workaround.
  evidence: components/ui/tooltip.tsx; features/addresses/addresses-section.tsx (`PrimaryField`). Review row 25 of spec 4.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-add-and-edit-a-policy.md`
  summary: (Foundation, unverified) `valueListOptions` (lib/api/type-keys.ts, decision 1A of spec 5.2) now also searches a type's relation attributes when an attrKey isn't among its own attributes. If the Person or ContactPoint type key carries `label` (or another attrKey the Personal, Phone or Email Sections read) under `relationships[]` only, those Sections would start offering the platform's list instead of their fallback. Check both type keys on demo; if so, confirm the platform list is the wanted one.
  evidence: lib/api/type-keys.ts (`valueListOptions`); consumers features/personal/use-person-options.ts:55, features/contacts/email-section.tsx:467, phone-section.tsx:549; their tests carry no `relationships`. Review row 17 of spec 5.2 (maybe-false, medium if true).
- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-add-and-edit-a-policy.md`
  summary: (Foundation) Tooltip and DropdownMenu are still on older Radix internals than Dialog 1.3.1, so they would break inside a Dialog or Sheet the way Popover and Select did (pointer-events, outside click closing the modal, Escape, focus trap). Align them (`@radix-ui/react-tooltip`, `@radix-ui/react-dropdown-menu`) before either is used inside a modal.
  evidence: package.json; the Radix Popover/Select alignment PR (`feat/foundation-radix-popover-select`) fixed the same class of bug found in Story 5.2. Review row 18 of spec 5.2.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-add-and-edit-a-policy.md`
  summary: (Team B / Foundation) The 1health backend answers its paged lists as its own `PageImpl`, serialized `{ data, pageNumber, pageSize, offset, emptyPage, firstPage, lastPage, numberOfElements, totalElements, totalPages }`, never Spring's `{ content, last }`. The organizations fixtures use `{ content: [] … }`, so Story 10.1's parser for `v2/user/organization/portal` (also a `PageImpl`, 1h-ng-bo-core-be UserResource.java:214-217) would inherit the wrong shape. Fix the fixtures before Story 10.1 reads the list.
  evidence: test/page-handlers/account.ts:22, e2e/fixtures/orgs.ts:13, test/providers.test.tsx:89, e2e/fixtures.spec.ts:43; `lib/server/named-ops/org-logo.ts:32-33,58` already reads `data`/`lastPage` correctly. Found 2026-10-20 while fixing the same bug in the file-delete named op (`feat/foundation-file-delete-page-shape`), the Addresses loader (`feat/NG-9026-epic-4`) and the Insurance loader (Story 5.2).

## Deferred from: integrated code review (2026-10-21)

- Foundation / dependency tooling: `braces@3.0.3` through `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch` is flagged by [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The advisory lists no patched version as of this review. This is a development lint dependency; no production dependency path was reported. Track a supported upstream fix and rerun the complete audit then. Do not suppress the advisory globally or replace the lint stack in this maintenance patch. Production high/critical audits run in CI. **2026-10-21 follow-up: mitigated locally by user request** with the version-specific pnpm patch `patches/braces@3.0.3.patch`, bounding active brace/parenthesis AST depth to100; regression tests exercise the installed ESLint dependency. Upstream release tracking remains open: the full registry audit still reports3.0.3, and no advisory ignore rule is added. See `patches/README.md` for scope, verification and removal steps.

- source_spec: `spec-foundation-tooltip-keyboard-scroll.md`
  summary: Existing DisabledAction protected presses can intermittently prevent the immediately following Escape from dismissing the tooltip.
  evidence: Unpatched baseline reproduces the identical browser Escape assertion (expected0 tooltips, received1),39/40 passed with one mobile failure; /tmp/tooltip-baseline-disabled.log and /tmp/tooltip-baseline-disabled-results retain evidence. Patched focused run passed20/20; the application Tooltip wrapper and current-task protected-press guard are unchanged. Investigate dismissal ordering separately from focus-scroll preservation.
