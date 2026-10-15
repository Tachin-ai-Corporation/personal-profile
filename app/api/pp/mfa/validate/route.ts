import { createMfaValidateHandler } from "@/lib/server/named-ops/mfa-validate"

export const dynamic = "force-dynamic"

/** Every method goes through the named-op wrapper: kill switch first, then 405 for anything but POST. */
const handler = createMfaValidateHandler()

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const HEAD = handler
export const OPTIONS = handler
