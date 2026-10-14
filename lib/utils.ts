import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge that knows the 1health type scale (`app/globals.css`). Without
 * it, `text-body` / `text-caption` look like text colors, so `cn("text-body",
 * "text-muted-foreground")` would silently drop the font size.
 */
export const TYPE_SCALE = ["display", "h1", "h2", "h3", "h4", "body-lg", "body", "body-sm", "caption"] as const

const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: [...TYPE_SCALE] },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const organizationLabels = {
  labOrganizations: "Lab Organization",
  healthcareOrganizations: "Healthcare Organization",
  supplierOrganizations: "Supplier Organization",
} as const
