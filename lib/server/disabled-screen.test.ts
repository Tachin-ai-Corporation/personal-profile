import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DISABLED_MESSAGES } from "@/lib/shared/messages"
import { environmentConfig } from "@/lib/shared/environments"
import { setLogSink } from "@/lib/server/log"
import { resetServerEnvCache } from "@/lib/server/env"
import { SESSION_COOKIE, sealSession } from "@/lib/server/session/session"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { makeSession, NOW } from "@/test/session-fixture"
import {
  createDisabledScreenHandler,
  DISABLED_FROM_AUTH,
  DISABLED_FROM_HEADER,
  DISABLED_SCREEN_DARK_TOKENS,
  DISABLED_SCREEN_TOKENS,
  disabledScreenEnvironment,
  disabledScreenHtml,
} from "./disabled-screen"

const DEMO_PORTAL = environmentConfig("demo").portalUrl
const PROD_PORTAL = environmentConfig("prod").portalUrl

beforeEach(() => stubServerEnv())

const request = (headers: Record<string, string> = {}, method = "GET") => new Request("http://localhost:3000/disabled", { method, headers })

describe("disabledScreenHtml", () => {
  const html = disabledScreenHtml("https://portal.example/?a=1&b=\"2\"")

  it("is a static document with the draft copy, one link and no script", () => {
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('<html lang="en">')
    expect(html).toContain(`<title>${DISABLED_MESSAGES.title}</title>`)
    expect(html).toContain(`<h1>${DISABLED_MESSAGES.title}</h1>`)
    expect(html).toContain(DISABLED_MESSAGES.body)
    expect(html).toContain(`>${DISABLED_MESSAGES.action}</a>`)
    expect(html).not.toMatch(/<script|\son\w+=|javascript:/i)
    expect(html.match(/<a /g)).toHaveLength(1)
  })

  it("escapes the link target", () => {
    expect(html).toContain('href="https://portal.example/?a=1&#38;b=&#34;2&#34;"')
  })
})

describe("DISABLED_SCREEN_TOKENS (light) and DISABLED_SCREEN_DARK_TOKENS", () => {
  /** A top-level block's declarations in app/globals.css. */
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8")
  const block = (selector: string): Map<string, string> => {
    const start = css.indexOf(`\n${selector} {`)
    const body = css.slice(start, css.indexOf("\n}", start))
    return new Map([...body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
  }
  const declarations = block(":root")
  const dark = block(".dark")
  /** Resolves `var()` against `scope`, then the light palette. */
  const resolve = (value: string, scope: Map<string, string> = declarations): string => {
    const ref = /^var\((--[\w-]+)\)$/.exec(value)
    return ref ? resolve(scope.get(ref[1]) ?? declarations.get(ref[1]) ?? "", scope) : value.toLowerCase()
  }

  it.each([
    ["background", "--background"],
    ["foreground", "--foreground"],
    ["card", "--card"],
    ["mutedForeground", "--muted-foreground"],
    ["primary", "--primary"],
    ["primaryForeground", "--primary-foreground"],
    ["border", "--border"],
    ["ring", "--ring"],
  ] as const)("dark %s equals the .dark %s token", (key, token) => {
    expect(dark.size).toBeGreaterThan(0)
    expect(DISABLED_SCREEN_DARK_TOKENS[key]).toBe(resolve(dark.get(token) ?? "", dark))
  })

  it("the page applies the dark values under prefers-color-scheme: dark", () => {
    const html = disabledScreenHtml("https://p.example/")
    const media = html.slice(html.indexOf("@media (prefers-color-scheme: dark)"))
    for (const value of Object.values(DISABLED_SCREEN_DARK_TOKENS)) expect(media).toContain(value)
  })

  it.each([
    ["background", "--background"],
    ["foreground", "--foreground"],
    ["card", "--card"],
    ["mutedForeground", "--muted-foreground"],
    ["primary", "--primary"],
    ["primaryForeground", "--primary-foreground"],
    ["border", "--border"],
    ["ring", "--ring"],
    ["radius", "--radius"],
  ] as const)("%s equals the light %s token", (key, token) => {
    expect(DISABLED_SCREEN_TOKENS[key]).toBe(resolve(declarations.get(token) ?? ""))
  })
})

describe("disabledScreenEnvironment (/auth: referrer → cookie → prod; other pages: session → cookie → prod)", () => {
  it("prefers the session's environment, even an aged session", async () => {
    const seal = await sealSession(makeSession({ environment: "demo", lastSeen: NOW - 3_600_000 }))
    expect(await disabledScreenEnvironment(request({ cookie: `${SESSION_COOKIE}=${seal}; onehealth_environment=prod` }))).toBe("demo")
  })

  it("then the remembered environment cookie", async () => {
    expect(await disabledScreenEnvironment(request({ cookie: `${SESSION_COOKIE}=junk; onehealth_environment=demo` }))).toBe("demo")
  })

  it("reads the referrer only when the switched-off page was /auth", async () => {
    const referer = "https://1health.demo.1health.io/apps"
    expect(await disabledScreenEnvironment(request({ referer, [DISABLED_FROM_HEADER]: DISABLED_FROM_AUTH }))).toBe("demo")
    expect(await disabledScreenEnvironment(request({ referer }))).toBe("prod")
    expect(await disabledScreenEnvironment(request({ referer: "https://example.com/", [DISABLED_FROM_HEADER]: DISABLED_FROM_AUTH }))).toBe("prod")
    expect(await disabledScreenEnvironment(request({ [DISABLED_FROM_HEADER]: DISABLED_FROM_AUTH }))).toBe("prod")
  })

  it("on /auth (D2): the referrer first, then the remembered cookie, never the session", async () => {
    const seal = await sealSession(makeSession({ environment: "prod" }))
    const fromAuth = { [DISABLED_FROM_HEADER]: DISABLED_FROM_AUTH }
    expect(
      await disabledScreenEnvironment(request({ ...fromAuth, referer: "https://1health.demo.1health.io/", cookie: `${SESSION_COOKIE}=${seal}; onehealth_environment=prod` })),
    ).toBe("demo")
    expect(await disabledScreenEnvironment(request({ ...fromAuth, referer: "https://1health.app.1health.io/", cookie: "onehealth_environment=demo" }))).toBe("prod")
    expect(await disabledScreenEnvironment(request({ ...fromAuth, referer: "https://example.com/", cookie: "onehealth_environment=demo" }))).toBe("demo")
    expect(await disabledScreenEnvironment(request({ ...fromAuth, cookie: `${SESSION_COOKIE}=${await sealSession(makeSession({ environment: "demo" }))}` }))).toBe("prod")
  })

  it("survives a misconfigured env (the session cannot be unsealed)", async () => {
    vi.stubEnv("SESSION_SECRET", "short")
    resetServerEnvCache()
    expect(await disabledScreenEnvironment(request({ cookie: `${SESSION_COOKIE}=x; onehealth_environment=demo` }))).toBe("demo")
  })
})

describe("the /disabled handler", () => {
  it.each<Record<string, string>>([{ PP_DISABLED: "1" }, { ACCOUNT_DISABLED: "1" }])("with %o answers 503 HTML, no-store, with the portal of the environment", async (env) => {
    const lines: string[] = []
    const restore = setLogSink({ info: (l) => void lines.push(l), warn: (l) => void lines.push(l), error: (l) => void lines.push(l) })
    const handler = createDisabledScreenHandler({ env: testEnv(env), now: () => NOW })
    const response = await handler(request({ cookie: "onehealth_environment=demo" }))
    restore()
    expect(response.status).toBe(503)
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("Retry-After")).toBe("300")
    expect(await response.text()).toContain(`href="${DEMO_PORTAL}"`)
    expect(JSON.parse(lines[0])).toMatchObject({ routeTemplate: "/disabled", status: 503 })
  })

  it("answers HEAD with no body and other methods with the same screen", async () => {
    const handler = createDisabledScreenHandler({ env: testEnv({ PP_DISABLED: "1" }), now: () => NOW })
    const head = await handler(request({}, "HEAD"))
    expect(head.status).toBe(503)
    expect(await head.text()).toBe("")
    const post = await handler(request({}, "POST"))
    expect(post.status).toBe(503)
    expect(await post.text()).toContain(`href="${PROD_PORTAL}"`)
  })

  it("is 404 while no switch is on", async () => {
    const response = await createDisabledScreenHandler({ env: testEnv(), now: () => NOW })(request())
    expect(response.status).toBe(404)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
  })

  it("uses the real env and clock by default", async () => {
    stubServerEnv({ PP_DISABLED: "1" })
    expect((await createDisabledScreenHandler()(request())).status).toBe(503)
  })
})
