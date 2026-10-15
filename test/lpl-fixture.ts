import { createCipheriv, randomBytes } from "node:crypto"
import { deriveKey } from "@/lib/server/launch/lpl-crypto"

/** Encrypts a launch payload the way the 1health portal does (IV ‖ ciphertext ‖ tag, base64). */
export function encryptLpl(plaintext: string, secretKey: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secretKey), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString("base64")
}

export function launchPayload(overrides: { appId?: string; userId?: number; code?: string } = {}): string {
  return JSON.stringify({
    required: {
      apiKey: { name: overrides.appId ?? "test-app-demo" },
      tenant: { id: 1 },
      user: { id: overrides.userId ?? 42 },
      oneTimeCode: { value: overrides.code ?? "one-time-code", issuedAt: "2026-10-14T10:00:00Z", expiresAt: "2026-10-14T10:01:00Z" },
    },
    optional: { user_first_name: "Ann" },
  })
}
