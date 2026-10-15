import { AuthScreen } from "@/features/shell"
import { configuredEnvironments, rememberedEnvironment } from "@/lib/server/page-session"

export const dynamic = "force-dynamic"

/**
 * The launch entry (Story 1.2, D9). Reads only the `onehealth_environment`
 * cookie (display only) and the configured environment names (D18), and
 * renders the client screen, which reads `lpl`.
 */
export default async function AuthPage() {
  return <AuthScreen rememberedEnvironment={await rememberedEnvironment()} environments={configuredEnvironments()} />
}
