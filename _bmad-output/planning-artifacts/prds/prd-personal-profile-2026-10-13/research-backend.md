# Research extract — 1h-ng-bo-core-be (2026-10-13)

Paths relative to ../1h-ng-bo-core-be/bo-core/src/main/java/com/sirma/bocore/. Permissions come from access-control.json functionalities (role Patient → "Patient functionality"), not @PreAuthorize. External-app tokens act as the launching user (externalApplicationId claim = audit/revocation only) → app can do whatever the user's role allows.

| Need | Endpoint | Source | Patient? |
|---|---|---|---|
| Read self | GET /v2/user/myself → OneHealthUserDTO (SSN = masked preview) | v2/rest/UserResource.java:399 | yes |
| Read person (+profilePicture) | GET /v2/person/{personId}?type= | PersonResource.java:92 | **no (Proctor only)** |
| Edit self | PUT /v2/user/edit PersonalInformationDTO | UserResource.java:282 → UserServiceImpl.editUserProfile | yes |
| SSN reveal | GET /v2/person/{personId}/ssn/expose → plaintext | PersonResource.java:152 (self, MTA, SysAdmin, Proctor-of-patient) | yes |
| Contact points write | POST /v2/health/contact-point ManageContactPointDTO | onehealth/ContactPointResource.java:28 | yes |
| Contact points list | GET /v2/user/contact-point/list?type= | UserResource.java:480 | yes |
| Verify | POST /v2/health/contact-point/verify {contactPointIds} | OneHealthResource.java:132 | yes |
| Addresses | POST/GET list/PUT {id}/DELETE {id} /v2/person/location | PersonResource.java:65-86 | yes |
| Avatar upload | POST /v2/health/type/Person/{personId}/relation/PersonHasProfilePictureFile/file/upload | OneHealthResource.java:216 | yes |
| Avatar preview | GET /v2/user/profile-picture/preview | UserResource.java:288 | yes |
| Insurance | POST/GET/PUT /v2/health/patient/insurance; payer lookup GET /v2/health/insurance/organizations; DELETE /v2/health/insurance/{id} | OneHealthResource.java:138-166, InsuranceResource.java | yes |
| Medical record upload | POST /v2/person/{personId}/medical-record (multipart) | PersonResource.java:160 | yes |
| Countries | GET /v2/public/countries | PublicResource.java:63 | public |

Notes:
- Contact point types in backend enum: Mobile, Email, Landline, Social Media, Fax, Home, Work, Other. No isMobile flag.
- SSN: stored PGP-encrypted + masked preview `***-**-1234` + BCrypt hash (uniqueness → SOCIAL_SECURITY_NUMBER_EXISTS). Sending "n/a" clears it. Reads return preview only.
- editUserProfile rejects email used by another user and calls switchPrimaryContactPoint.
- Race/Ethnicity value lists live in db/data/external/external.json (Race ~8513, Ethnicity ~8572). Race: American Indian or Alaska Native, Asian, Black or African American, Hispanic or Latino, Middle Eastern or North African, Native Hawaiian or other Pacific Islander, White, Other Race, Unknown. Ethnicity: Not Hispanic or Latino, Hispanic or Latino, Unknown. Only generic lookup GET /v1/boc/{key} is effectively admin-only → hardcode in app or add a patient-safe enum endpoint.
- Alternative v3 Patient Vault API (/v3/patient...) is for a different role ("Patient Vault"), not self-profile.
- GET /v2/person/{id} is NOT patient-accessible → profilePicture id must come another way (preview endpoint works without id).
