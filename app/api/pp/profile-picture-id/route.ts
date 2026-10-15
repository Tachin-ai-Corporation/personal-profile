import { createProfilePictureIdHandler } from "@/lib/server/named-ops/profile-picture-id"

export const dynamic = "force-dynamic"

/** Every method goes through the named-op wrapper: kill switch first, then 405 for anything but GET. */
const handler = createProfilePictureIdHandler()

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const HEAD = handler
export const OPTIONS = handler
