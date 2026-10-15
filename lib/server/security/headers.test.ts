import { describe, expect, it } from "vitest"
import { buildCsp, generateNonce, securityHeaders, STATIC_SECURITY_HEADERS } from "./headers"

const EXPECTED_CSP = (n: string) =>
  `default-src 'self'; script-src 'self' 'nonce-${n}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`

describe("security headers", () => {
  it("generates fresh 128-bit nonces", () => {
    const a = generateNonce()
    expect(Buffer.from(a, "base64")).toHaveLength(16)
    expect(generateNonce()).not.toBe(a)
  })

  it("builds the exact AD-21 CSP", () => {
    expect(buildCsp("abc")).toBe(EXPECTED_CSP("abc"))
    expect(buildCsp("abc", true)).toContain("'strict-dynamic' 'unsafe-eval'")
  })

  it("includes every AD-21 header (D10: never framed, COOP same-origin)", () => {
    const headers = securityHeaders("n")
    expect(headers["Content-Security-Policy"]).toBe(EXPECTED_CSP("n"))
    expect(headers).toMatchObject(STATIC_SECURITY_HEADERS)
    expect(headers["X-Frame-Options"]).toBe("DENY")
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin")
  })
})
