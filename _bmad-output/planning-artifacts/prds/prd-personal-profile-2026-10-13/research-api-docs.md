# Research extract — agents.md API docs (2026-10-13)

Source: agents.md (https://agents.1health.io/public/{env}/api/...), local ../ai-agents-knowledge, cross-checked with ../1h-ng-bo-core-be DTOs. Many doc request bodies are `{}` — backend DTOs are source of truth.

## Profile read
- `GET /v2/user/myself` → OneHealthUserDTO (id, personId, names incl. middle/prefix/suffix/otherNames/titles, birthDate, race, ethnicity, biologicalGender, genderIdentity, sexualOrientation, cityOfBirth, socialSecurityNumber (masked?), email, phoneNumber, emailVerified, locale, preferredLanguage, receiveNotifications, locations[], signature, roles).
- `GET /v2/person/{personId}?type=` → PersonLocationSignatureDTO (+ location, signature, profilePicture{id,name}); `type` values unknown.
- `GET /v2/person/{personId}/ssn/expose` → plaintext SSN (reveal action).

## Personal info write
- `PUT /v2/user/edit` body PersonalInformationDTO (all optional; send full object). Fields: firstName, middleName, lastName, namePrefix, nameSuffix, otherNames, titles, birthDate (YYYY-MM-DD), cityOfBirth, race, ethnicity, biologicalGender, genderIdentity, sexualOrientation, socialSecurityNumber, email, phoneNumber, phoneNumberRegion, locale, preferredLanguage.
- Avoid `POST /v2/person/upsert` for self-edit (patient mgmt; side-effect contact points).

## Contact points (Phone / Email / Social Media)
- List: `GET /v2/user/contact-point/list?type=Email&type=Mobile&type=Landline&type=Social Media` → [{id,name,value,type,label,isVerified,phoneNumberRegion,isNotificationEnabled}].
- Batch write: `POST /v2/health/contact-point` ManageContactPointDTO {contactPointsToAdd[], contactPointsToUpdate[], contactPointsToRemove[ids]}.
- type: Email | Mobile | Landline | Social Media (immutable after create). label: Home | Main | Old | Primary | Personal | Work.
- Rules (400s): one primary per type; only verified can become primary; cannot add directly as primary; max 20 per type; no duplicates; valid email/phone/URL; primary email unique across users. Primary Email/Mobile = login identifiers.
- "Mobile" checkbox in UI = type Mobile vs Landline (no boolean).
- Notification bell = `isNotificationEnabled` per contact point.
- Verify: `POST /v2/health/contact-point/verify` {contactPointIds:[]} → {success, contactPointIdsWithSendError[]}; user completes via emailed link (public endpoint). OTP alt: `/v3/otp/send|verify`.

## Addresses
- `GET /v2/person/location/list?page=0&size=50` (paged); `POST /v2/person/location`; `PUT /v2/person/location/{id}`; `DELETE /v2/person/location/{id}` — all for logged-in person.
- PersonLocationRequestDTO: id, fullAddress, addressLine1, addressLine2, county, cityName, stateName, country, countryCode, postalCode, lat, lon, validated, primary, personLocationType. Response uses isPrimary/isValidated.
- No lookup route for personLocationType values.

## Avatar
- Preview: `GET /v2/user/profile-picture/preview` (bytes; auth fetch → blob URL; `?v=<imageId>` cache-bust).
- Upload: `POST /v2/health/type/Person/{personId}/relation/PersonHasProfilePictureFile/file/upload?isPublic=true&fileName=` multipart `file` → {id,name}.

## Insurance
- `GET /v2/health/patient/insurance?page=0&size=15`; `POST`/`PUT /v2/health/patient/insurance/{id}`; `DELETE /v2/health/insurance/{id}`.
- InsuranceDTO required: memberIdNumber, planEffectiveDate, insuranceOrganizationDTO, insuranceType (MEDICAL|DENTAL|HOSPICE|VISION), insurancePrecedence (PRIMARY|SECONDARY|SUPPLEMENTAL|OTHER), relationshipToInsured (SELF|SPOUSE|PARENT|CHILD|DEPENDENT); optional insuranceGroupId, expirationDate, cancellationDate, subscriber (when not SELF).
- Payer picker: `GET /v2/health/insurance/organizations?name=`. Card file download: `GET /v2/health/insurance/{id}/file/{fileId}/download`.

## Medical
- No structured medical-info endpoint. Candidates: encounters `GET /v2/health/encounter/person/{personId}/list`, medical-record upload `POST /v2/person/{personId}/medical-record`, questionnaire answers `GET /v2/health/questionnaire/person/{personId}`. Confirm against 1health-fe.

## Lookups
- Countries: `GET /v2/public/countries` → [{id,name}].
- Race/ethnicity/gender/sexual orientation/address types: no route → mirror 1health-fe enums.

## Gaps
Undocumented bodies, no demographic lookups, no avatar route (generic upload), no social endpoint (contact points), error envelope undocumented.
