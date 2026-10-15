"use client"

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react"

/**
 * Who shows a failed `myself` read (F6-1 review H1). `PageFrame` shows one
 * page banner for it, unless a mounted Section shows the error itself
 * (Stories 2.1, 7.4, 8.1): such a Section calls `useClaimMyselfError(true)`
 * while it renders its own `myself` load error. The page banner is hidden
 * only while at least one claim is held, so a tab without such a Section
 * still shows the page banner. No route or shell edit is needed.
 */
interface MyselfErrorClaims {
  readonly count: number
  readonly claim: () => () => void
}

const MyselfErrorClaimContext = createContext<MyselfErrorClaims | null>(null)

export function MyselfErrorClaimProvider({ children }: { readonly children: ReactNode }) {
  const [count, setCount] = useState(0)
  const claim = useCallback(() => {
    setCount((n) => n + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      setCount((n) => n - 1)
    }
  }, [])
  const value = useMemo(() => ({ count, claim }), [count, claim])
  return <MyselfErrorClaimContext.Provider value={value}>{children}</MyselfErrorClaimContext.Provider>
}

/** Holds a claim while `active` (the Section is showing its own `myself` load error) and mounted. */
export function useClaimMyselfError(active: boolean): void {
  const claim = useContext(MyselfErrorClaimContext)?.claim
  // Layout effect: the claim lands before paint, so the page banner never flashes next to the Section's own error.
  useLayoutEffect(() => {
    if (!active || !claim) return
    return claim()
  }, [active, claim])
}

/** The number of claims held on this page (`PageFrame`). */
export function useMyselfErrorClaimed(): boolean {
  return (useContext(MyselfErrorClaimContext)?.count ?? 0) > 0
}
