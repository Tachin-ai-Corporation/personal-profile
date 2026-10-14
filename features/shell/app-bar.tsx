import { SHELL_MESSAGES } from "@/lib/shared/messages"
import type { PageId } from "./nav-types"
import { PageNav } from "./page-nav"
import { ReturnLink } from "./return-link"

/**
 * The 52 px app bar, the same on `/` and `/account` (Story 1.8, D10, D11):
 * plain-text wordmark (never focusable), a vertical rule, the Pages nav and
 * "Return to 1health". Below 400 px the nav wraps onto its own row under the
 * wordmark. DOM order keeps the tab order page nav → Return.
 */
export function AppBar({ current }: { readonly current: PageId }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="flex min-h-13 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1 md:px-6">
        <span className="text-body font-bold text-primary-text">{SHELL_MESSAGES.wordmark}</span>
        <span aria-hidden="true" className="h-6 w-px bg-border max-[400px]:hidden" />
        <PageNav current={current} className="max-[400px]:order-last max-[400px]:basis-full" />
        <ReturnLink className="ml-auto" />
      </div>
    </header>
  )
}
