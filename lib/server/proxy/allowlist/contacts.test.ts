import { describe, expect, it } from "vitest"
import { buildUpstreamQuery } from "../match"
import { entries } from "./contacts"

const q = (s: string) => new URLSearchParams(s)
const [entry] = entries

describe("contact-point list", () => {
  it("is the one shared GET, not a Profile-module entry", () => {
    expect(entries.map((e) => `${e.method} ${e.template}`)).toEqual(["GET v2/user/contact-point/list"])
    expect(entry.profile).toBeUndefined()
  })

  it("accepts repeatable types, Social Media included", () => {
    expect(buildUpstreamQuery(entry, q("type=Email&type=Mobile&type=Landline&type=Social+Media"))?.getAll("type")).toEqual([
      "Email",
      "Mobile",
      "Landline",
      "Social Media",
    ])
    expect(buildUpstreamQuery(entry, q("type=Social%20Media"))?.get("type")).toBe("Social Media")
  })

  it.each(["Fax", "Social", "social media", "Social  Media", "Email,Mobile"])("rejects type %j", (type) => {
    expect(buildUpstreamQuery(entry, q(`type=${encodeURIComponent(type)}`))).toBeNull()
  })
})
