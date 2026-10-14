/** Every value `logApiCall` must hide (kept out of lib/ so the forbidden-pattern check stays strict). */
export const SENSITIVE_SAMPLE = {
  ssnText: "SSN 123-45-6789 on file",
  code: "654321",
  qrCode: "data:image/png;base64,AAAA",
  lpl: "lpl-value",
  access_token: "tok-a",
  refresh_token: "tok-r",
  idToken: "tok-i",
  authorization: "Bearer x",
  note: "eyJhbGciOi.eyJzdWIi.c2ln",
  list: [{ firstName: "Ann" }, null],
  count: 3,
} as const
