import { describe, expect, it } from "vitest"
import { fileDeletePath, fileDownloadPath } from "."
import { isFileId } from "./files"

describe("fileDownloadPath", () => {
  it.each<[number | string, string]>([
    [42, "/api/1h/v2/file/42/download"],
    ["7", "/api/1h/v2/file/7/download"],
  ])("%j → the proxy's image download path", (id, path) => {
    expect(fileDownloadPath(id)).toBe(path)
  })

  it.each<number | string>([0, -1, 1.5, Number.NaN, 2 ** 60, "", "01", "1a", "../1", "1/../../x"])("refuses %j", (id) => {
    expect(fileDownloadPath(id)).toBeNull()
  })

  it("isFileId rejects non-id values", () => {
    expect(isFileId(null)).toBe(false)
    expect(isFileId({})).toBe(false)
    expect(isFileId(3)).toBe(true)
  })
})

describe("fileDeletePath (spec F7-2)", () => {
  it.each<[number | string, string]>([
    [42, "/api/pp/file/42"],
    ["7", "/api/pp/file/7"],
  ])("%j → the ownership-checked delete op, with no query", (id, path) => {
    expect(fileDeletePath(id)).toBe(path)
    expect(fileDeletePath(id)).not.toContain("?")
  })

  it.each<number | string>([0, -1, 1.5, "", "01", "1,2", "../1"])("refuses %j", (id) => {
    expect(fileDeletePath(id)).toBeNull()
  })
})
