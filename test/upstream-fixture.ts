import { environmentConfig } from "@/lib/shared/environments"
import { fakeAccessToken } from "./session-fixture"

/** Upstream URLs per environment, always derived from the environment map. */
export const DEMO = environmentConfig("demo")
export const PROD = environmentConfig("prod")
export const DEV = environmentConfig("dev")

export const exchangeUrl = (apiRoot: string): string => `${apiRoot}/api/v2/public/external-application/auth/oauth2/user/token`
export const myselfUrl = (apiRoot: string): string => `${apiRoot}/api/v2/user/myself`
export const idpTokenUrl = (apiRoot: string): string => `${apiRoot}/auth/oauth2/token`
export const logoutAllUrl = (apiRoot: string): string => `${apiRoot}/auth/user/logout/all-devices`

/** The 1health OAuth token body (wire shape, snake_case). */
export function tokenResponse(
  overrides: { tenantId?: number | string; accessToken?: string; refreshToken?: string } = {},
): Record<string, unknown> {
  return {
    access_token: overrides.accessToken ?? fakeAccessToken(overrides.tenantId ?? 1),
    refresh_token: overrides.refreshToken ?? "refresh-token",
    expires_in: 3000,
    id_token: "id-token",
  }
}

/** The refresh grant answer. */
export function refreshResponse(accessToken: string, refreshToken?: string): Record<string, unknown> {
  return { access_token: accessToken, expires_in: 3000, ...(refreshToken ? { refresh_token: refreshToken } : {}) }
}
