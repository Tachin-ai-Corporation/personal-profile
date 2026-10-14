import { render, screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { configureClient, getPortalUrl } from "@/lib/api"
import { server } from "../../test/server"
import { ClientConfig } from "./client-config"
import { MyselfName } from "./myself-name"

let consoleSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  configureClient({})
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  configureClient({})
  consoleSpy.mockRestore()
})

describe("ClientConfig", () => {
  it("registers the binding before a child's first fetch", async () => {
    const seen: (string | null)[] = []
    server.use(
      http.get("http://localhost:3000/api/1h/v2/user/myself", ({ request }) => {
        seen.push(request.headers.get("X-PP-Session"))
        return HttpResponse.json({ id: 1, personId: 1, firstName: "Ada", lastName: "Lovelace" })
      }),
    )

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <ClientConfig sessionBinding="x" portalUrl="https://p.example/applications">
          <MyselfName />
        </ClientConfig>
      </SWRConfig>,
    )

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument()
    expect(seen[0]).toBe("x")
    expect(getPortalUrl()).toBe("https://p.example/applications")
  })
})
