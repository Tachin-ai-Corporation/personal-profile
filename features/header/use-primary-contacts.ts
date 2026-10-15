"use client"

import useSWR from "swr"
import { fetchers, findPrimary, keys, type ContactPoint } from "@/lib/api"

export interface PrimaryContacts {
  readonly phone: ContactPoint | undefined
  readonly email: ContactPoint | undefined
}

/**
 * The header's primary phone (Mobile or Landline) and email, read through the
 * shared per-type keys. With `enabled` false (below 768 px) nothing is fetched.
 * A failed request leaves its item undefined: the header never shows an error.
 */
export function usePrimaryContacts(enabled: boolean): PrimaryContacts {
  const mobile = useSWR(enabled ? keys.contactPoints("Mobile") : null, () => fetchers.contactPoints("Mobile"))
  const landline = useSWR(enabled ? keys.contactPoints("Landline") : null, () => fetchers.contactPoints("Landline"))
  const email = useSWR(enabled ? keys.contactPoints("Email") : null, () => fetchers.contactPoints("Email"))
  // Mobile wins: don't show a Landline primary until the Mobile request has settled,
  // or the header would flip from Landline to Mobile.
  const mobileSettled = mobile.data !== undefined || mobile.error !== undefined
  return {
    phone: findPrimary(mobile.data) ?? (mobileSettled ? findPrimary(landline.data) : undefined),
    email: findPrimary(email.data),
  }
}
