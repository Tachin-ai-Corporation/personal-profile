import { createHmac, hkdfSync } from "node:crypto"
import { describe, expect, it } from "vitest"
import { encryptLpl } from "@/test/lpl-fixture"
import { decryptLpl, deriveKey, signCode } from "./lpl-crypto"

const SECRET = "test-demo-secret-key"

describe("deriveKey", () => {
  it("is standard HKDF-SHA256 with a zero salt and empty info (KeyDerivationUtil)", () => {
    const expected = Buffer.from(hkdfSync("sha256", Buffer.from(SECRET), Buffer.alloc(32, 0), Buffer.alloc(0), 32))
    expect(deriveKey(SECRET).equals(expected)).toBe(true)
  })
})

describe("decryptLpl", () => {
  it("round-trips a fixture encrypted like the portal", () => {
    expect(decryptLpl(encryptLpl('{"hello":"world"}', SECRET), SECRET)).toBe('{"hello":"world"}')
  })

  it("drops line breaks and tabs from an LPL wrapped over several lines", () => {
    const lpl = encryptLpl('{"wrapped":true}', SECRET)
    const wrapped = `${lpl.slice(0, 10)}\r\n${lpl.slice(10, 20)}\n\t${lpl.slice(20)}\n`
    expect(decryptLpl(wrapped, SECRET)).toBe('{"wrapped":true}')
  })

  it("turns spaces back into '+'", () => {
    let lpl = encryptLpl("x".repeat(40), SECRET)
    while (!lpl.includes("+")) lpl = encryptLpl("x".repeat(40), SECRET)
    expect(decryptLpl(lpl.replace(/\+/g, " "), SECRET)).toBe("x".repeat(40))
  })

  it.each([
    ["not base64", "%%%not-base64%%%"],
    ["cleartext JSON", '{"required":{}}'],
    ["too short", Buffer.alloc(27).toString("base64")],
  ])("rejects %s", (_label, lpl) => {
    expect(decryptLpl(lpl, SECRET)).toBeNull()
  })

  it("rejects a payload sealed with another key (GCM authentication)", () => {
    expect(decryptLpl(encryptLpl("{}", "another-secret"), SECRET)).toBeNull()
  })
})

describe("signCode", () => {
  it("is base64 HMAC-SHA256 keyed with the raw secret", () => {
    expect(signCode("abc", SECRET)).toBe(createHmac("sha256", SECRET).update("abc").digest("base64"))
  })
})
