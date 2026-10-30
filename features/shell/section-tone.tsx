"use client"

import { createContext, useContext } from "react"
import type { AnimatedIconTone } from "@/components/ui/animated-icon"

/**
 * The tone of the accented `SectionContainer` around a table (design refresh,
 * PROPOSAL): `SectionTable` reads it for its header row and row hover. `null`
 * (the default, and every container without `accent`): the table is unchanged.
 */
export const SectionToneContext = createContext<AnimatedIconTone | null>(null)

export function useSectionTone(): AnimatedIconTone | null {
  return useContext(SectionToneContext)
}
