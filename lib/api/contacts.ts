/**
 * Contact Point writes (Team A, Epic 3: Stories 3.1–3.7): the Contact Point
 * write engine shared by the Phone, Email and Social media Sections (add,
 * relabel, remove, verify, make primary, notifications). Pre-created by spec
 * F7-2 so Epic 3 adds code here without editing `lib/api/index.ts`
 * (re-exported with `export *`); its tests go in `contacts.test.ts`.
 *
 * Reads stay in `contact-points.ts` (`fetchContactPoints`, `keys.contactPoints`,
 * shared with the header and the `/account` pickers): never re-map a row
 * here. After a write, revalidate with `mutateContactPoints(...types)` and
 * `mutateMyself()` (`keys.ts`).
 *
 * Endpoints this module will own (each allowlist entry lands with its story
 * in `lib/server/proxy/allowlist/contacts.ts`; confirm each against agents.md
 * first): the `v2/user/contact-point` create / update / delete calls, the
 * phone and email verification calls (3.3, 3.6) and the make-primary and
 * notification calls (3.4, 3.6).
 *
 * Export names carry the `contact` prefix (`contactPointCreatePath`, not
 * `createPath`): FOUNDATION.md §1, rule T6.
 */

export {}
