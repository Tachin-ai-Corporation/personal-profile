import { describe, expect, it } from "vitest"
import { insuranceImageNotUploaded, insurancePartialToast, type InsuranceCardResult } from "./card-upload"

/** Story 5.3: the toast after a save with card images, for every mix of outcomes. */

const r = (outcome: InsuranceCardResult["outcome"], name: string): InsuranceCardResult => ({ outcome, name })

describe("insurancePartialToast", () => {
  it.each<[string, Parameters<typeof insurancePartialToast>[0], string | null]>([
    ["no images", {}, null],
    ["every image uploaded", { front: r("uploaded", "f.png"), back: r("uploaded", "b.png") }, null],
    ["one failed only (back)", { front: r("uploaded", "f.png"), back: r("failed", "b.png") }, "Insurance saved. Back image not uploaded."],
    ["one failed only (front, no back chosen)", { front: r("failed", "f.png") }, "Insurance saved. Front image not uploaded."],
    ["both failed", { front: r("failed", "f.png"), back: r("failed", "b.png") }, "Insurance saved. Card images not uploaded."],
    ["one rejected only", { back: r("rejected", "b.png") }, "Insurance saved. b.png couldn't be used. Choose another file."],
    [
      "both rejected",
      { front: r("rejected", "f.png"), back: r("rejected", "b.jpg") },
      "Insurance saved. f.png couldn't be used. Choose another file. b.jpg couldn't be used. Choose another file.",
    ],
    [
      "front failed and back rejected",
      { front: r("failed", "f.png"), back: r("rejected", "b.png") },
      "Insurance saved. Front image not uploaded. b.png couldn't be used. Choose another file.",
    ],
    ["front rejected and back uploaded", { front: r("rejected", "f.png"), back: r("uploaded", "b.png") }, "Insurance saved. f.png couldn't be used. Choose another file."],
  ])("%s", (_label, results, expected) => {
    expect(insurancePartialToast(results)).toBe(expected)
  })

  it("names a side for a failed Retry", () => {
    expect(insuranceImageNotUploaded("front")).toBe("Front image not uploaded.")
    expect(insuranceImageNotUploaded("back")).toBe("Back image not uploaded.")
  })
})
