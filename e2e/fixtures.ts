import { createCipheriv, hkdfSync, randomBytes } from "node:crypto"
import { expect, type Page } from "@playwright/test"

/**
 * Shared e2e fixtures: a valid launch payload for the webServer's dummy
 * per-environment secrets/app ids (see `playwright.config.ts`, D1) and a fresh
 * one-time code. Never real credentials.
 */

export type E2eEnvironment = "demo" | "prod"

/** The dummy values `playwright.config.ts` boots the server with. */
const SECRETS: Record<E2eEnvironment, string> = { demo: "dummy-demo-secret", prod: "dummy-prod-secret" }
const APP_IDS: Record<E2eEnvironment, string> = { demo: "dummy-app-demo", prod: "dummy-app-prod" }
const USER_ID = 42 // must match the mock `/myself` id

/**
 * Build a valid base64 lpl for `env`: base64( IV(12) ++ AES-256-GCM ciphertext ++ tag(16) ),
 * keyed with that environment's dummy secret, so `/api/token` detects `env`.
 */
export function makeLpl(code: string, env: E2eEnvironment = "demo"): string {
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(SECRETS[env], "utf8"), Buffer.alloc(32, 0), Buffer.alloc(0), 32))
  const payload = JSON.stringify({
    required: {
      apiKey: { name: APP_IDS[env] },
      tenant: { id: 1 },
      user: { id: USER_ID },
      externalApplicationId: { id: 1 },
      oneTimeCode: { value: code, issuedAt: "2026-10-14T00:00:00" },
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

/**
 * Launch through the real `/auth` flow (D1, D9) and wait for the signed-in
 * profile page. With no launch tab param the app lands on `/`, which
 * `ProfileTabs` normalises to `?tab=contacts`.
 */
export async function launch(page: Page, env: E2eEnvironment = "demo"): Promise<void> {
  await page.goto(`/auth?lpl=${encodeURIComponent(makeLpl(freshCode(), env))}`)
  await expect(page).toHaveURL(/\/\?tab=contacts$/)
}
