"use client"

import type React from "react"
import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { cn } from "@/lib/utils"
import { PAGE_PATHS, type PageId } from "./nav-types"
import { useNavigate } from "./navigate"

const ITEMS: readonly { readonly page: PageId; readonly label: string }[] = [
  { page: "profile", label: SHELL_MESSAGES.pageProfile },
  { page: "account", label: SHELL_MESSAGES.pageAccount },
]

/** A plain left click; modified clicks keep the browser's own behavior (new tab, ...). */
export function isPlainClick(event: React.MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

export interface PageNavProps {
  readonly current: PageId
  readonly className?: string
}

/**
 * `<nav aria-label="Pages">`: Personal Profile and Account (Story 1.8, D11).
 * Desktop: text tabs with a 2 px primary indicator on the current page.
 * Below 768 px: a segmented control. The current item does nothing.
 */
export function PageNav({ current, className }: PageNavProps) {
  const navigate = useNavigate()

  return (
    <nav aria-label={SHELL_MESSAGES.pagesNavLabel} className={className}>
      <ul className="flex items-stretch max-md:rounded-md max-md:border max-md:border-border max-md:p-0.5 md:gap-1">
        {ITEMS.map(({ page, label }) => {
          const active = page === current
          return (
            <li key={page} className="flex max-md:flex-1">
              <a
                href={PAGE_PATHS[page]}
                aria-current={active ? "page" : undefined}
                onClick={(event) => {
                  if (!isPlainClick(event)) return
                  event.preventDefault()
                  if (!active) void navigate({ page })
                }}
                className={cn(
                  "inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap px-3 text-body-sm font-medium text-muted-foreground",
                  "rounded-md transition-colors duration-150 ease-standard motion-reduce:transition-none hover:bg-accent hover:text-accent-foreground",
                  "outline-none focus-ring",
                  // Desktop: 2 px primary bottom indicator; mobile: the selected segment is filled.
                  "md:rounded-b-none md:border-b-2 md:border-transparent",
                  active && "font-semibold text-foreground md:border-primary max-md:bg-accent max-md:text-accent-foreground",
                )}
              >
                {label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
