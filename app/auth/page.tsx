import { AuthScreen } from "@/features/shell/auth-screen"
import { DisabledScreen } from "@/features/shell/disabled-screen"
import { PP_DISABLED } from "@/lib/server/env"
import { readEnvironmentCookie } from "@/lib/server/environment-cookie"

/**
 * `/auth` — the launch entry (Story 1.2, D1, D9).
 *
 * The portal opens `/auth?lpl=…` in its own tab. This server wrapper reads only
 * the remembered `onehealth_environment` cookie (display only, D4) and hands it
 * to the client screen, which runs the launch flow against `POST /api/token`.
 * It never reads `lpl`: only the client screen does, and it strips it from the
 * address bar before sending anything.
 *
 * With the kill switch on it renders the disabled screen directly, with no
 * redirect (AD-20). Rendered per request so the proxy's no-store headers and
 * CSP nonce apply (AD-18).
 */
export const dynamic = "force-dynamic"

export default async function AuthPage() {
  const remembered = await readEnvironmentCookie()
  if (PP_DISABLED) {
    return <DisabledScreen environment={remembered} useReferrer />
  }
  return <AuthScreen rememberedEnvironment={remembered} />
}
