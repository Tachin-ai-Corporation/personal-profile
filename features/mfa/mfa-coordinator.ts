import type { MfaAppId } from "./authenticator-card"

type Mutation = "enable" | "validate" | "disable"
type Active = { readonly token: number; readonly mutation: Mutation; readonly app?: MfaAppId }
export type MfaCoordinationState = { readonly phase: "idle" }
  | (Active & { readonly phase: "mutation" })
  | (Active & { readonly phase: "reconciliation"; readonly failed: boolean })

/** Non-secret coordination lives as long as the SWR cache, including panel remounts. */
export function createMfaCoordinator() {
  let state: MfaCoordinationState = { phase: "idle" }
  let sequence = 0
  const listeners = new Set<() => void>()
  const publish = (next: MfaCoordinationState): void => {
    state = next
    for (const listener of listeners) listener()
  }
  const owns = (token: number): boolean => state.phase !== "idle" && state.token === token
  return {
    getSnapshot: (): MfaCoordinationState => state,
    subscribe: (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    begin: (mutation: Mutation, app?: MfaAppId): number | null => {
      if (state.phase !== "idle") return null
      const token = ++sequence
      publish({ phase: "mutation", token, mutation, app })
      return token
    },
    release: (token: number): void => { if (state.phase !== "idle" && state.token === token) publish({ phase: "idle" }) },
    reconcile: async (token: number, read: () => Promise<boolean>): Promise<void> => {
      if (state.phase === "idle" || state.token !== token) return
      publish({ ...state, phase: "reconciliation", failed: false })
      try {
        const successful = await read()
        if (owns(token)) {
          if (successful) publish({ phase: "idle" })
          else publish({ ...state, phase: "reconciliation", failed: true })
        }
      } catch {
        // SWR owns read errors and automatic/manual retries. Cached status cannot release this gate.
        if (owns(token)) publish({ ...state, phase: "reconciliation", failed: true })
      }
    },
    observeRead: (successful: boolean): void => {
      if (successful && state.phase === "reconciliation" && state.failed) publish({ phase: "idle" })
    },
  }
}
export type MfaCoordinator = ReturnType<typeof createMfaCoordinator>
const coordinators = new WeakMap<object, MfaCoordinator>()
export function mfaCoordinatorFor(cache: object): MfaCoordinator {
  let coordinator = coordinators.get(cache)
  if (!coordinator) { coordinator = createMfaCoordinator(); coordinators.set(cache, coordinator) }
  return coordinator
}
