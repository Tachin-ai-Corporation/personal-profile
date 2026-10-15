import { screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { useEffect } from "react"
import { describe, expect, it } from "vitest"
import {
  useCurrentPage,
  useMyself,
  useRegisterSection,
  useSectionDraft,
  useSectionFrame,
  type PageId,
  type SectionRegistration,
} from "@/features/shell"
import { contactPointWire, myselfWire } from "./myself-fixture"
import { renderInPage, TEST_DRAFT_ENVIRONMENT } from "./providers"

/** A minimal Section: reads `myself`, registers, reports its frame ready once loaded. */
function ProbeSection({ registration }: { readonly registration?: Partial<SectionRegistration> }) {
  const page = useCurrentPage()
  const { myself, error } = useMyself()
  const { onReady } = useSectionFrame("account")
  const draft = useSectionDraft("account")
  useRegisterSection({ id: "account", label: "Probe", displayOrder: 1, isDirty: false, discard: () => undefined, ...registration })
  useEffect(() => {
    if (myself) onReady()
  }, [myself, onReady])
  return (
    <section>
      <p>page:{page}</p>
      <p>name:{myself ? `${myself.firstName} ${myself.lastName}` : error ? "error" : "loading"}</p>
      <p>draft:{draft.kind}</p>
    </section>
  )
}

/** A same-origin GET, as `callApi` makes it. */
async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(new URL(path, window.location.origin))
  return { status: res.status, body: await res.json() }
}

describe("renderInPage (spec F7-1)", () => {
  it.each<PageId>(["profile", "account"])("on %s: the current page, myself from the page handlers, the registry and the frame sink", async (page) => {
    const { registry, frameReady } = renderInPage(<ProbeSection />, { page })
    expect(screen.getByText(`page:${page}`)).toBeTruthy()
    expect(screen.getByText("draft:none")).toBeTruthy()
    await screen.findByText("name:Ann Lee")
    expect(registry.get("account")?.label).toBe("Probe")
    await waitFor(() => expect(frameReady).toHaveBeenCalledWith("account"))
  })

  it("passes the myself and contacts overrides through", async () => {
    renderInPage(<ProbeSection />, {
      page: "account",
      myself: myselfWire({ firstName: "Bo" }),
      contacts: { Email: [contactPointWire({ type: "Email", value: "bo@example.com" })] },
    })
    await screen.findByText("name:Bo Lee")
    expect((await get("/api/1h/v2/user/contact-point/list?type=Email")).body).toEqual([expect.objectContaining({ value: "bo@example.com" })])
    expect((await get("/api/1h/v2/user/contact-point/list?type=Mobile")).body).toEqual([])
  })

  it("extra handlers win over the page defaults (a forbidden myself)", async () => {
    renderInPage(<ProbeSection />, {
      page: "profile",
      handlers: [http.get("/api/1h/v2/user/myself", () => HttpResponse.json({ message: "No access", code: 403 }, { status: 403 }))],
    })
    await screen.findByText("name:error")
  })

  it("sets the URL when given one", () => {
    renderInPage(<ProbeSection />, { page: "profile", url: "/?tab=contacts#phone" })
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/?tab=contacts#phone")
  })

  it("profile defaults: type keys, addresses, countries, insurance and the picture id, all empty", async () => {
    renderInPage(<ProbeSection />, { page: "profile" })
    expect(await get("/api/1h/v2/type/key/Insurance")).toEqual({ status: 200, body: { boKey: "Insurance", attributes: [] } })
    expect(await get("/api/1h/v2/person/location/list?page=0&size=50")).toEqual({ status: 200, body: [] })
    expect(await get("/api/1h/v2/public/countries")).toEqual({ status: 200, body: [] })
    expect(await get("/api/1h/v2/health/patient/insurance?page=0")).toEqual({ status: 200, body: [] })
    expect(await get("/api/pp/profile-picture-id")).toEqual({ status: 200, body: { fileId: null } })
  })

  it("account defaults: NPI 404, practice support 404 NO_PRACTICE, an empty organizations page, the picture id", async () => {
    renderInPage(<ProbeSection />, { page: "account" })
    expect((await get("/api/1h/v2/user/npi")).status).toBe(404)
    expect(await get("/api/pp/practice-support")).toEqual({ status: 404, body: { errorCode: "NO_PRACTICE", source: "proxy" } })
    expect(await get("/api/1h/v2/user/organization/portal?page=0&size=12")).toEqual({ status: 200, body: expect.objectContaining({ content: [] }) })
    expect(await get("/api/pp/profile-picture-id")).toEqual({ status: 200, body: { fileId: null } })
  })

  it("drafts are keyed to the demo environment and the fixture user (pp:draft:v1:demo:42:account)", async () => {
    renderInPage(
      <ProbeSection
        registration={{
          isDirty: true,
          userChanged: true,
          dataStatus: "loaded",
          draftFields: ["firstName"],
          getDraftValues: () => ({ firstName: "Bo" }),
          getDraftBase: () => ({ firstName: "Ann" }),
          describeDraftDiff: () => [],
          applyDraft: () => true,
          save: async () => ({ ok: true }),
        }}
      />,
      { page: "account" },
    )
    await waitFor(() => expect(localStorage.getItem(`pp:draft:v1:${TEST_DRAFT_ENVIRONMENT}:42:account`)).toContain('"firstName":"Bo"'), { timeout: 3000 })
  })
})
