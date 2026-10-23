/**
 * The e2e helpers, one file per area (specs F6-3, F7-1). Specs import from
 * `./fixtures`; a story adds helpers to its own area file, never here. One
 * `export *` line per file in this folder: `test/e2e-fixture-exports.test.ts`
 * fails on a missing line or on a name exported by two files.
 * Foundation: core, journey (the NG-9019 journey suite). Team A: defaults-profile, header, personal, contacts,
 * addresses, insurance. Team B: defaults-account, account, mfa, npi, orgs.
 */
export * from "./core"
export * from "./defaults-profile"
export * from "./defaults-account"
export * from "./header"
export * from "./personal"
export * from "./contacts"
export * from "./addresses"
export * from "./insurance"
export * from "./account"
export * from "./mfa"
export * from "./npi"
export * from "./orgs"
export * from "./journey"
