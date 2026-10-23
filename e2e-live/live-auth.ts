import { createHash, createHmac, randomBytes } from "node:crypto"
import { request, type APIRequestContext, type APIResponse } from "@playwright/test"
import { DEV, type LiveSettings } from "./live-env"

/**
 * A real dev sign-in without a browser, the way `1h-ng-api-test-py`
 * (`backend/app/services/auth_token_service.py`) does it: OAuth2 authorization
 * code + PKCE against the Spring Authorization Server at `<apiRoot>/auth`
 * (`public-client`, no CSRF, no captcha), then the code exchange. The redirect
 * URI is never visited; the code is read from the `Location` header.
 */

const AUTH = `${DEV.apiRoot}/auth`
const CLIENT_ID = "public-client"
const MAX_HOPS = 10

function base64url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48))
  return { verifier, challenge: base64url(createHash("sha256").update(verifier).digest()) }
}

function base32Decode(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  const clean = secret.replace(/[\s=-]/g, "").toUpperCase()
  let bits = ""
  for (const char of clean) {
    const index = alphabet.indexOf(char)
    if (index < 0) throw new Error("LIVE_DEV_TOTP_SECRET is not base32.")
    bits += index.toString(2).padStart(5, "0")
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), for a test user with MFA on. */
export function totp(secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)))
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return code.toString().padStart(6, "0")
}

function absolute(location: string): string {
  return new URL(location, `${AUTH}/`).toString()
}

const isRedirect = (response: APIResponse): boolean => response.status() >= 300 && response.status() < 400

/** Follows redirects that stay on the auth server, stopping at the consent page or an outside URL. */
async function followInternal(ctx: APIRequestContext, response: APIResponse): Promise<APIResponse> {
  for (let hop = 0; hop < MAX_HOPS && isRedirect(response); hop += 1) {
    const location = absolute(response.headers().location ?? "")
    // `${AUTH}/` with the slash: the portal's `/authorized` (the redirect URI) also starts with `/auth`.
    if (!location.startsWith(`${AUTH}/`) || location.includes("/oauth2/consent")) break
    response = await ctx.get(location, { maxRedirects: 0 })
  }
  return response
}

/** A dev sign-in: the token, and the tenant it was switched away from (to restore afterwards). */
export interface DevSignIn {
  readonly accessToken: string
  readonly switchedFrom?: string
}

/** Signs the dev test user in and answers a fresh access token on the personal account. */
export async function devAccessToken(settings: LiveSettings): Promise<DevSignIn> {
  const { verifier, challenge } = pkcePair()
  const ctx = await request.newContext()
  try {
    let response = await ctx.get(`${AUTH}/oauth2/authorize`, {
      maxRedirects: 0,
      params: {
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: settings.redirectUri,
        scope: "openid",
        code_challenge: challenge,
        code_challenge_method: "S256",
      },
    })
    response = await followInternal(ctx, response)
    response = await ctx.post(`${AUTH}/login`, { maxRedirects: 0, form: { username: settings.username, password: settings.password } })
    // A refused login redirects to the portal with `?error=<reason>`.
    const loginError = isRedirect(response) ? new URL(absolute(response.headers().location ?? "")).searchParams.get("error") : null
    if (loginError) throw new Error(`Dev sign-in refused for LIVE_DEV_USERNAME: ${loginError}`)
    response = await followInternal(ctx, response)

    let location = isRedirect(response) ? absolute(response.headers().location ?? "") : ""
    if (location.includes("/oauth2/consent")) {
      const state = new URL(location).searchParams.get("state") ?? ""
      response = await ctx.post(`${AUTH}/oauth2/consent`, { maxRedirects: 0, form: { client_id: CLIENT_ID, state, scope: "openid" } })
      response = await followInternal(ctx, response)
      location = isRedirect(response) ? absolute(response.headers().location ?? "") : ""
    }
    const code = location ? new URL(location).searchParams.get("code") : null
    if (!code) {
      const where = location ? new URL(location).pathname : `HTTP ${response.status()}`
      throw new Error(
        `Dev sign-in gave no authorization code (stopped at ${where}). Check LIVE_DEV_USERNAME/LIVE_DEV_PASSWORD and that LIVE_DEV_REDIRECT_URI (${settings.redirectUri}) is registered for public-client.`,
      )
    }

    const form: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: settings.redirectUri,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }
    if (settings.totpSecret) form.totp_code = totp(settings.totpSecret)
    const token = await ctx.post(`${AUTH}/oauth2/token`, { form })
    if (!token.ok()) {
      const body = await token.text()
      const hint = body.includes("missing_mfa_code") ? " The user has MFA on: set LIVE_DEV_TOTP_SECRET." : ""
      throw new Error(`Dev token exchange failed (HTTP ${token.status()}).${hint}`)
    }
    const { access_token: accessToken } = (await token.json()) as { access_token?: string }
    if (!accessToken) throw new Error("Dev token response had no access token.")
    const tenant = tokenTenant(accessToken)
    if (tenant === undefined || tenant === PERSONAL_TENANT) return { accessToken }
    if (!settings.switchTenant) {
      throw new Error(
        `The dev test user's token is for tenant ${tenant}, not the personal account (${PERSONAL_TENANT}). Set LIVE_DEV_SWITCH_TENANT=1, or sign in to ${DEV.portalUrl} as that user and switch to the personal account once.`,
      )
    }
    return { accessToken: await switchTenant(ctx, accessToken, PERSONAL_TENANT), switchedFrom: tenant }
  } finally {
    await ctx.dispose()
  }
}

/**
 * The launch must come from the personal account (tenant 1): the BFF refuses
 * any other tenant with `403 WRONG_TENANT`. The token carries the user's last
 * used tenant.
 */
const PERSONAL_TENANT = "1"

/** The token's `tenantId` claim, if it has one. */
function tokenTenant(accessToken: string): string | undefined {
  const [, payload] = accessToken.split(".")
  if (!payload) return undefined
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>
    const tenant = claims.tenantId ?? claims.tenant_id
    return tenant === undefined || tenant === null ? undefined : String(tenant)
  } catch {
    return undefined
  }
}

/**
 * Trades the token for one on `tenant`, as `1h-ng-api-test-py` does
 * (`auth_token_service.py` `switch_tenant`): `revokeToken=false` keeps the
 * user's other sessions. The backend also saves it as the user's last tenant,
 * so the fixtures switch back afterwards (`restoreTenant`). Only with
 * `LIVE_DEV_SWITCH_TENANT=1`.
 */
async function switchTenant(ctx: APIRequestContext, accessToken: string, tenant: string): Promise<string> {
  const response = await ctx.get(`${DEV.apiBase}/v2/user/switch-tenant/${tenant}`, {
    params: { revokeToken: "false" },
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok()) throw new Error(`Switching the dev test user to tenant ${tenant} failed (HTTP ${response.status()}).`)
  const body = (await response.json()) as { auth?: { access_token?: string } }
  const switched = body.auth?.access_token
  if (!switched) throw new Error("The tenant switch answered no access token.")
  if (tokenTenant(switched) !== undefined && tokenTenant(switched) !== tenant) throw new Error(`The tenant switch did not land on tenant ${tenant}.`)
  return switched
}

/** Puts the user's last tenant back to what it was before `devAccessToken` switched it. */
export async function restoreTenant(signIn: DevSignIn): Promise<void> {
  if (signIn.switchedFrom === undefined) return
  const ctx = await request.newContext()
  try {
    await switchTenant(ctx, signIn.accessToken, signIn.switchedFrom)
  } finally {
    await ctx.dispose()
  }
}

/** What the specs use to read (and clean up) dev data: the dev REST API, or the app's proxy in portal mode. */
export interface LiveApi {
  get(path: string, options?: { params?: Record<string, string> }): Promise<APIResponse>
  post(path: string, options: { data: unknown }): Promise<APIResponse>
  delete(path: string): Promise<APIResponse>
}

/** A request context on the dev REST API (`<apiRoot>/api/`) with the user's bearer token. */
export async function devApi(accessToken: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL: `${DEV.apiBase}/`, extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` } })
}

/**
 * The encrypted Launch Payload the portal would put in `?lpl=`: the backend
 * mints a one-time code (valid about 1 minute, single use) and encrypts it
 * with the app's Security code (`GET v2/external-application/{id}/launch-payload`).
 */
export async function devLaunchPayload(api: LiveApi, appId: string): Promise<string> {
  const response = await api.get(`v2/external-application/${appId}/launch-payload`)
  if (!response.ok()) {
    // e.g. 400 "Multi Tenant Admin and Customer support are not allowed to access Third-party applications".
    const { message } = ((await response.json().catch(() => ({}))) as { message?: string })
    throw new Error(`launch-payload for app ${appId} failed (HTTP ${response.status()})${message ? `: ${message}` : ""}. The test user must be a plain patient account.`)
  }
  const { launchPayload } = (await response.json()) as { launchPayload?: string }
  if (!launchPayload) throw new Error("launch-payload response had no launchPayload.")
  return launchPayload
}
