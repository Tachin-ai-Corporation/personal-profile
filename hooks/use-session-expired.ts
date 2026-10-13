"use client"

import { useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

/**
 * Centralized hook for handling SESSION_EXPIRED errors.
 * Prevents multiple simultaneous redirect attempts that cause React Error #185.
 *
 * Usage:
 *   const { handleSessionExpired } = useSessionExpired()
 *
 *   // In your action handler:
 *   if (handleSessionExpired(result.error)) return
 */
export function useSessionExpired() {
  const { toast } = useToast()
  const router = useRouter()
  const isRedirectingRef = useRef(false)

  const handleSessionExpired = useCallback(
    (error: string | undefined | null): boolean => {
      if (error === "SESSION_EXPIRED") {
        // Prevent multiple redirects
        if (isRedirectingRef.current) {
          return true
        }

        isRedirectingRef.current = true

        toast({
          title: "Session Expired",
          description: "Your session has expired. Redirecting to login...",
          variant: "destructive",
        })

        setTimeout(() => {
          router.push("/auth")
        }, 1500)

        return true
      }
      return false
    },
    [toast, router],
  )

  return {
    handleSessionExpired,
  }
}
