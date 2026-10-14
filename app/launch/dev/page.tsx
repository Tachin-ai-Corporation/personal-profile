import { notFound } from "next/navigation"
import { APP_ENV } from "@/lib/server/env"

/**
 * Dev-only launch helper (AD-20).
 *
 * Renders a plain GET form that posts a pasted `lpl` (and a tab choice) to
 * `/launch`, only when `APP_ENV === "dev"`. In demo/prod the route 404s.
 * It never logs, stores, or echoes the payload (the textarea starts empty and
 * the GET submit carries it straight to `/launch`).
 *
 * Rendered per request so the env check runs on every request (AD-18).
 */
export const dynamic = "force-dynamic"

export default function LaunchDevPage() {
  if (APP_ENV !== "dev") {
    notFound()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Dev launch</h1>
        <p className="text-muted-foreground text-sm">
          Paste an encrypted launch payload and submit it to <code>/launch</code>. Dev only.
        </p>
      </div>

      <form method="GET" action="/launch" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="lpl" className="text-sm font-medium">
            Launch payload (lpl)
          </label>
          <textarea
            id="lpl"
            name="lpl"
            rows={6}
            required
            autoComplete="off"
            spellCheck={false}
            className="min-h-32 w-full rounded-md border p-2 font-mono text-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="tab" className="text-sm font-medium">
            Tab
          </label>
          <select id="tab" name="tab" defaultValue="contacts" className="w-full rounded-md border p-2 text-sm">
            <option value="contacts">contacts</option>
            <option value="insurance">insurance</option>
            <option value="medical">medical</option>
          </select>
        </div>

        <button
          type="submit"
          className="bg-primary text-primary-foreground inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium"
        >
          Launch
        </button>
      </form>
    </main>
  )
}
