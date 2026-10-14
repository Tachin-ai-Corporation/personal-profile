"use client"

import { useMyself } from "./use-myself"

/**
 * The signed-in user's "First Last". A loaded name stays visible even if a
 * later revalidation fails; the neutral error line shows only when there is no
 * data. Nothing renders while loading.
 */
export function MyselfName() {
  const { data, error } = useMyself()

  if (data) {
    const name = [data.firstName, data.lastName].map((s) => s.trim()).filter(Boolean).join(" ")
    if (!name) return null
    return <p className="text-lg">{name}</p>
  }
  if (error) {
    return <p className="text-muted-foreground">We couldn&apos;t load your name.</p>
  }
  return null
}
