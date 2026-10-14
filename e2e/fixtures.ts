import { createCipheriv, hkdfSync, randomBytes } from "node:crypto"

/**
 * Shared e2e fixtures: a valid launch payload for the webServer's dummy
 * secret/app-id (see `playwright.config.ts`) and a fresh one-time code.
 */

const SECRET = "dummy-onehealth-secret"
const APP_ID = "dummy-app-id"
const USER_ID = 42 // must match the mock `/myself` id

/** Build a valid base64 lpl: base64( IV(12) ++ AES-256-GCM ciphertext ++ tag(16) ). */
export function makeLpl(code: string): string {
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(SECRET, "utf8"), Buffer.alloc(32, 0), Buffer.alloc(0), 32))
  const payload = JSON.stringify({
    required: {
      apiKey: { name: APP_ID },
      tenant: { id: 1 },
      user: { id: USER_ID },
      externalApplicationId: { id: 1 },
      oneTimeCode: { value: code, issuedAt: "2026-10-13T00:00:00" },
    },
  })
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ct, tag]).toString("base64")
}

/** A fresh, unique one-time code per test (the mock tracks consumed codes for the run). */
export function freshCode(): string {
  return `code-${randomBytes(8).toString("hex")}`
}
