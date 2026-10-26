import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { http, HttpResponse } from "msw"
import { useEffect } from "react"
import { useSWRConfig, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CurrentPageProvider, type PageId } from "@/features/shell"
import { keys } from "@/lib/api"
import { stubViewport } from "@/test/media"
import { server } from "@/test/msw-server"
import { TestProviders } from "@/test/providers"
import { displayName, ProfileHeader } from "."

const MYSELF = "/api/1h/v2/user/myself"
const LIST = "/api/1h/v2/user/contact-point/list"
const PICTURE_ID = "/api/pp/profile-picture-id"
const PREVIEW = "/api/1h/v2/user/profile-picture/preview"

type Rows = Record<string, unknown>[]

/** Answers each contact type from a table (a function answers with a response). */
function contacts(byType: Record<string, Rows | (() => Response)>): string[] {
  const seen: string[] = []
  server.use(
    http.get(LIST, ({ request }) => {
      const type = new URL(request.url).searchParams.get("type") ?? ""
      seen.push(type)
      const answer = byType[type] ?? []
      return typeof answer === "function" ? answer() : HttpResponse.json(answer)
    }),
  )
  return seen
}

function myself(body: Record<string, unknown> = { id: 1, personId: 2, firstName: "Ann", lastName: "Lee", username: "ann.lee" }) {
  server.use(http.get(MYSELF, () => HttpResponse.json(body)))
}

/** The test cache's own mutate (the global one targets the default cache). */
let mutate: ScopedMutator
function MutateProbe() {
  const { mutate: scoped } = useSWRConfig()
  useEffect(() => {
    mutate = scoped
  }, [scoped])
  return null
}

function setup(page: PageId = "profile") {
  return render(
    <TestProviders>
      <CurrentPageProvider value={page}>
        <MutateProbe />
        <main>
          <ProfileHeader />
        </main>
      </CurrentPageProvider>
    </TestProviders>,
  )
}

/** Answers the header's picture id (Story 1.9); a function answers with a response. Returns the request count. */
function pictureId(answer: Record<string, unknown> | (() => Response | Promise<Response>)): () => number {
  let count = 0
  server.use(
    http.get(PICTURE_ID, () => {
      count += 1
      return typeof answer === "function" ? answer() : HttpResponse.json(answer)
    }),
  )
  return () => count
}

/** The header's `<img>` (decorative, so not in the accessibility tree), if any. */
const avatarImage = (container: HTMLElement): HTMLImageElement | null => container.querySelector("img")

// TestProviders installs no handlers: every header test answers "no picture" unless it says otherwise.
beforeEach(() => {
  pictureId({ fileId: null })
})

afterEach(() => document.documentElement.classList.remove("dark"))

describe("names", () => {
  it("builds the display name with a username fallback", () => {
    expect(displayName({ firstName: " Ann ", lastName: "Lee", username: "u" })).toBe("Ann Lee")
    expect(displayName({ firstName: "Ann", lastName: "", username: "u" })).toBe("Ann")
    expect(displayName({ firstName: " ", lastName: "", username: " ann.lee " })).toBe("ann.lee")
    expect(displayName({ firstName: null, lastName: null, username: null })).toBe("")
  })
})

describe("ProfileHeader", () => {
  it("shows a skeleton while myself loads, then initials and the name as the single h1", async () => {
    stubViewport(360)
    myself()
    setup()
    expect(screen.getByRole("status", { name: "Loading your profile" })).toBeTruthy()
    const h1 = await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    expect(h1.className).toContain("text-h4")
    expect(h1.classList.contains("capitalize")).toBe(true)
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByText("AL").className).toContain("text-primary-text")
    expect(screen.getByText("AL").className).toContain("size-10")
  })

  it("capitalizes a lowercase name for display only, as 1health-fe's header does", async () => {
    stubViewport(360)
    myself({ id: 1, firstName: "ann marie", lastName: "lee", username: "ann.lee" })
    setup("account")
    const h1 = await screen.findByRole("heading", { level: 1, name: "ann marie lee" })
    expect(h1.textContent).toBe("ann marie lee")
    expect(h1.classList.contains("capitalize")).toBe(true)
  })

  it("names the page in an h1 while myself loads", () => {
    stubViewport(360)
    myself()
    setup("account")
    expect(screen.getByRole("heading", { level: 1, name: "Account" }).className).toContain("sr-only")
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
  })

  it("falls back to the username, and a user icon, when names are blank", async () => {
    stubViewport(360)
    myself({ id: 1, firstName: "", lastName: null, username: "ann.lee" })
    const { container } = setup()
    const h1 = await screen.findByRole("heading", { level: 1, name: "ann.lee" })
    // A username keeps its case: only a person's name is capitalized for display.
    expect(h1.classList.contains("capitalize")).toBe(false)
    expect(container.querySelector("span[aria-hidden='true']:not([data-slot]) > svg")).not.toBeNull()
  })

  it.each<[PageId, string]>([
    ["profile", "Personal Profile"],
    ["account", "Account"],
  ])("keeps an h1 naming the current page (%s) when myself fails", async (page, name) => {
    stubViewport(360)
    server.use(http.get(MYSELF, () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })))
    setup(page)
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading your profile" })).toBeNull())
    expect(screen.getByRole("heading", { level: 1, name })).toBeTruthy()
  })

  it("at 768 px and above shows the primary phone and email", async () => {
    stubViewport(1280)
    myself()
    const seen = contacts({
      Mobile: [
        { id: 1, value: "+14155550000", label: "Old", type: "Mobile" },
        { id: 2, value: "+14155552125", label: "Primary", type: "Mobile" },
      ],
      Landline: [],
      Email: [{ id: 3, value: "ann@example.com", label: "Primary", type: "Email" }],
    })
    setup()
    expect(await screen.findByText("+1 (415) 555-2125")).toBeTruthy()
    expect(await screen.findByText("ann@example.com")).toBeTruthy()
    expect(screen.getByText("Primary phone")).toBeTruthy()
    expect(screen.getByText("Primary email")).toBeTruthy()
    expect(seen.toSorted()).toEqual(["Email", "Landline", "Mobile"])
  })

  it("formats the primary phone with its own row's region", async () => {
    stubViewport(1280)
    myself()
    contacts({ Mobile: [{ id: 2, value: "+442071838750", label: "Primary", type: "Mobile", phoneNumberRegion: "GB" }], Landline: [], Email: [] })
    setup()
    expect(await screen.findByText("+44 20 7183 8750")).toBeTruthy()
  })

  it("formats a national-format primary phone with its row's region", async () => {
    stubViewport(1280)
    myself()
    contacts({ Mobile: [{ id: 2, value: "02071838750", label: "Primary", type: "Mobile", phoneNumberRegion: "GB" }], Landline: [], Email: [] })
    setup()
    expect(await screen.findByText("+44 20 7183 8750")).toBeTruthy()
  })

  it("shows an unparsable primary phone as stored", async () => {
    stubViewport(1280)
    myself()
    contacts({ Mobile: [{ id: 2, value: "12", label: "Primary", type: "Mobile", phoneNumberRegion: "n/a" }], Landline: [], Email: [] })
    setup()
    expect(await screen.findByText("12")).toBeTruthy()
  })

  it("takes the primary phone from Landline when Mobile has none", async () => {
    stubViewport(1280)
    myself()
    contacts({ Mobile: [], Landline: [{ id: 4, value: "+12125550100", label: "Primary" }], Email: [] })
    setup()
    expect(await screen.findByText("+1 (212) 555-0100")).toBeTruthy()
    expect(screen.queryByText("Primary email")).toBeNull()
  })

  it("doesn't show a Landline primary until Mobile has settled (no Landline → Mobile flip)", async () => {
    stubViewport(1280)
    myself()
    let releaseMobile: () => void = () => undefined
    const mobileGate = new Promise<void>((resolve) => (releaseMobile = resolve))
    server.use(
      http.get(LIST, async ({ request }) => {
        const type = new URL(request.url).searchParams.get("type")
        if (type === "Mobile") {
          await mobileGate
          return HttpResponse.json([{ id: 1, value: "+14155552125", label: "Primary" }])
        }
        if (type === "Landline") return HttpResponse.json([{ id: 2, value: "+12125550100", label: "Primary" }])
        return HttpResponse.json([])
      }),
    )
    setup()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(screen.queryByText("+1 (212) 555-0100")).toBeNull()
    releaseMobile()
    expect(await screen.findByText("+1 (415) 555-2125")).toBeTruthy()
    expect(screen.queryByText("+1 (212) 555-0100")).toBeNull()
  })

  it("follows the viewport across 768 px both ways, fetching only on desktop", async () => {
    const resize = stubViewport(360)
    myself()
    const seen = contacts({ Email: [{ id: 3, value: "ann@example.com", label: "Primary" }] })
    setup()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    expect(seen).toEqual([])
    act(() => resize(1024))
    expect(await screen.findByText("ann@example.com")).toBeTruthy()
    expect(seen.toSorted()).toEqual(["Email", "Landline", "Mobile"])
    act(() => resize(767))
    await waitFor(() => expect(screen.queryByText("ann@example.com")).toBeNull())
    expect(seen).toHaveLength(3)
  })

  it("omits an item whose request failed, and never shows an error", async () => {
    stubViewport(1280)
    myself()
    contacts({
      Mobile: () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 }),
      Landline: () => new HttpResponse("oops", { status: 500 }),
      Email: [{ id: 3, value: "ann@example.com", label: "Primary" }],
    })
    setup()
    expect(await screen.findByText("ann@example.com")).toBeTruthy()
    expect(screen.queryByText("Primary phone")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("below 768 px fetches no contact points and shows avatar + name only", async () => {
    stubViewport(360)
    myself()
    const seen = contacts({ Email: [{ id: 3, value: "ann@example.com", label: "Primary" }] })
    setup()
    await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
    expect(seen).toEqual([])
    expect(screen.queryByText("ann@example.com")).toBeNull()
  })

  it("updates when the shared keys are mutated (no reload)", async () => {
    stubViewport(1280)
    myself()
    contacts({ Email: [{ id: 3, value: "ann@example.com", label: "Primary" }] })
    setup()
    await screen.findByText("ann@example.com")
    myself({ id: 1, firstName: "Ann", lastName: "Smith", username: "u" })
    contacts({ Email: [{ id: 5, value: "new@example.com", label: "Primary" }] })
    await act(async () => {
      await mutate(keys.myself())
      await mutate(keys.contactPoints("Email"))
    })
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Ann Smith"))
    expect(await screen.findByText("new@example.com")).toBeTruthy()
  })

  describe("Profile Picture (Story 1.9)", () => {
    it("shows the picture as a decorative 40 px circle, the initials until it has loaded; one id request", async () => {
      stubViewport(360)
      myself()
      const requests = pictureId({ fileId: 9001 })
      const { container } = setup()
      await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
      await waitFor(() => expect(avatarImage(container)).not.toBeNull())
      const img = avatarImage(container) as HTMLImageElement
      expect(img.getAttribute("src")).toBe(`${PREVIEW}?v=9001`)
      expect(img.getAttribute("alt")).toBe("")
      for (const name of ["size-10", "rounded-full", "object-cover", "bg-card"]) expect(img.classList.contains(name)).toBe(true)
      // Loading: the initials show and the image is hidden (no broken-image box).
      expect(img.hidden).toBe(true)
      expect(screen.getByText("AL")).toBeTruthy()
      fireEvent.load(img)
      expect(screen.queryByText("AL")).toBeNull()
      expect((avatarImage(container) as HTMLImageElement).hidden).toBe(false)
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
      expect(requests()).toBe(1)
    })

    it("shows the initials and requests no image without a picture", async () => {
      stubViewport(360)
      myself()
      const previews: string[] = []
      server.use(http.get(PREVIEW, ({ request }) => (previews.push(request.url), new HttpResponse(null, { status: 404 }))))
      const requests = pictureId({ fileId: null })
      const { container } = setup()
      await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
      await waitFor(() => expect(requests()).toBe(1))
      expect(screen.getByText("AL")).toBeTruthy()
      expect(avatarImage(container)).toBeNull()
      expect(previews).toEqual([])
    })

    it("shows the user icon without a name while the picture id is pending, then the picture", async () => {
      stubViewport(360)
      myself({ id: 1, firstName: "", lastName: null, username: "ann.lee" })
      let release: () => void = () => undefined
      const gate = new Promise<void>((resolve) => (release = resolve))
      pictureId(async () => {
        await gate
        return HttpResponse.json({ fileId: 9001 })
      })
      const { container } = setup()
      await screen.findByRole("heading", { level: 1, name: "ann.lee" })
      expect(container.querySelector("span[aria-hidden='true']:not([data-slot]) > svg")).not.toBeNull()
      expect(avatarImage(container)).toBeNull()
      release()
      await waitFor(() => expect(avatarImage(container)?.getAttribute("src")).toBe(`${PREVIEW}?v=9001`))
      fireEvent.error(avatarImage(container) as HTMLImageElement)
      expect(container.querySelector("span[aria-hidden='true']:not([data-slot]) > svg")).not.toBeNull()
    })

    it("falls back to the initials when the image fails, with no error text", async () => {
      stubViewport(360)
      myself()
      pictureId({ fileId: 9001 })
      const { container } = setup()
      await waitFor(() => expect(avatarImage(container)).not.toBeNull())
      fireEvent.error(avatarImage(container) as HTMLImageElement)
      expect(avatarImage(container)).toBeNull()
      expect(screen.getByText("AL")).toBeTruthy()
      expect(screen.queryByRole("alert")).toBeNull()
    })

    it.each<[string, () => Response]>([
      ["a 502", () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })],
      ["a network error", () => HttpResponse.error()],
      ["a malformed body", () => HttpResponse.json({ fileId: "9001" })],
    ])("shows the initials and no alert when the id read fails (%s)", async (_label, answer) => {
      stubViewport(360)
      myself()
      const requests = pictureId(answer)
      const { container } = setup()
      await screen.findByRole("heading", { level: 1, name: "Ann Lee" })
      await waitFor(() => expect(requests()).toBe(1))
      await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
      expect(screen.getByText("AL")).toBeTruthy()
      expect(avatarImage(container)).toBeNull()
      expect(screen.queryByRole("alert")).toBeNull()
    })

    it("loads the new picture when keys.profilePictureId() is mutated (no reload)", async () => {
      stubViewport(360)
      myself()
      pictureId({ fileId: 9001 })
      const { container } = setup()
      await waitFor(() => expect(avatarImage(container)?.getAttribute("src")).toBe(`${PREVIEW}?v=9001`))
      fireEvent.load(avatarImage(container) as HTMLImageElement)
      pictureId({ fileId: 9002 })
      await act(async () => {
        await mutate(keys.profilePictureId())
      })
      await waitFor(() => expect(avatarImage(container)?.getAttribute("src")).toBe(`${PREVIEW}?v=9002`))
      // The new image loads behind the initials, then replaces them.
      expect(screen.getByText("AL")).toBeTruthy()
      fireEvent.load(avatarImage(container) as HTMLImageElement)
      expect(screen.queryByText("AL")).toBeNull()
    })

    it.each(["light", "dark"])("has no axe violations with a picture in %s mode", async (theme) => {
      if (theme === "dark") document.documentElement.classList.add("dark")
      stubViewport(1280)
      myself()
      pictureId({ fileId: 9001 })
      contacts({ Email: [{ id: 3, value: "ann@example.com", label: "Primary" }] })
      const { container } = setup()
      await screen.findByText("ann@example.com")
      await waitFor(() => expect(avatarImage(container)).not.toBeNull())
      fireEvent.load(avatarImage(container) as HTMLImageElement)
      const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
      expect(results.violations).toEqual([])
    })
  })

  it.each(["light", "dark"])("has no axe violations in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    stubViewport(1280)
    myself()
    contacts({ Email: [{ id: 3, value: "ann@example.com", label: "Primary" }] })
    setup()
    await screen.findByText("ann@example.com")
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
