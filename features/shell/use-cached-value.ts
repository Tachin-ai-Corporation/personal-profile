"use client"

import { useCallback, useSyncExternalStore } from "react"
import { unstable_serialize, useSWRConfig, type Cache } from "swr"
import type { SwrKey } from "@/lib/api"

type Listener = () => void
interface Observation {
  readonly listeners: Map<string, Set<Listener>>
  readonly restore: () => void
}

const observations = new WeakMap<Cache, Observation>()

/** Observe public cache writes without becoming an SWR revalidation owner.
 * Keep the original cache identity: global and scoped mutate must still agree.
 * The two public methods are restored when the final observer unmounts.
 */
function subscribe(cache: Cache, key: string, listener: Listener): () => void {
  let observation = observations.get(cache)
  if (!observation) {
    const listeners = new Map<string, Set<Listener>>()
    const set = cache.set
    const remove = cache.delete
    const setDescriptor = Object.getOwnPropertyDescriptor(cache, "set")
    const deleteDescriptor = Object.getOwnPropertyDescriptor(cache, "delete")
    const notify = (changed: string): void => {
      for (const callback of [...(listeners.get(changed) ?? [])]) callback()
    }
    cache.set = function (changed, value) {
      const result = set.call(this, changed, value)
      notify(changed)
      return result
    }
    cache.delete = function (changed) {
      const result = remove.call(this, changed)
      notify(changed)
      return result
    }
    observation = { listeners, restore: () => {
      if (setDescriptor) Object.defineProperty(cache, "set", setDescriptor)
      else Reflect.deleteProperty(cache, "set")
      if (deleteDescriptor) Object.defineProperty(cache, "delete", deleteDescriptor)
      else Reflect.deleteProperty(cache, "delete")
    } }
    observations.set(cache, observation)
  }
  const current = observation
  const listeners = current.listeners.get(key) ?? new Set<Listener>()
  current.listeners.set(key, listeners)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) current.listeners.delete(key)
    if (!current.listeners.size) {
      current.restore()
      observations.delete(cache)
    }
  }
}

/** Cache-only data: never fetches or registers a competing SWR revalidator. */
export function useCachedValue<T>(key: SwrKey): T | undefined {
  const { cache, fallback } = useSWRConfig()
  const serialized = unstable_serialize(key)
  const listen = useCallback((listener: Listener) => subscribe(cache, serialized, listener), [cache, serialized])
  const snapshot = useCallback(() => {
    const data = cache.get(serialized)?.data
    return (data === undefined ? fallback[serialized] : data) as T | undefined
  }, [cache, fallback, serialized])
  return useSyncExternalStore(listen, snapshot, () => undefined)
}
