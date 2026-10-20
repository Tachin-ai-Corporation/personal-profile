import { expect, it, vi } from "vitest"
import { mfaCoordinatorFor } from "./mfa-coordinator"

it("shares only the cache's coordination and prevents conflicting flow leases", () => {
  const cache = {}
  const coordinator = mfaCoordinatorFor(cache)
  expect(mfaCoordinatorFor(cache)).toBe(coordinator)
  expect(mfaCoordinatorFor({})).not.toBe(coordinator)
  const listener = vi.fn()
  const unsubscribe = coordinator.subscribe(listener)
  const token = coordinator.begin("enable", "google")!
  expect(coordinator.begin("disable")).toBeNull()
  expect(coordinator.getSnapshot()).toMatchObject({ phase: "mutation", mutation: "enable", app: "google" })
  coordinator.release(token + 1)
  expect(coordinator.getSnapshot().phase).toBe("mutation")
  coordinator.release(token)
  expect(coordinator.getSnapshot().phase).toBe("idle")
  unsubscribe()
  coordinator.begin("disable")
  expect(listener).toHaveBeenCalledTimes(2)
})

it("holds a failed reconciliation through unsuccessful observations and releases on a successful read", async () => {
  const coordinator = mfaCoordinatorFor({})
  const token = coordinator.begin("disable")!
  await coordinator.reconcile(token, () => Promise.reject(new Error("Identity read failed")))
  expect(coordinator.getSnapshot()).toMatchObject({ phase: "reconciliation", failed: true })
  coordinator.observeRead(false)
  expect(coordinator.begin("enable", "authy")).toBeNull()
  coordinator.observeRead(true)
  expect(coordinator.getSnapshot().phase).toBe("idle")
})

it("does not let stale reconciliation settlement release a newer flow", async () => {
  const coordinator = mfaCoordinatorFor({})
  const first = coordinator.begin("disable")!
  let release!: (value: boolean) => void
  const held = new Promise<boolean>((resolve) => { release = resolve })
  const reconciliation = coordinator.reconcile(first, () => held)
  coordinator.release(first)
  const second = coordinator.begin("enable", "google")!
  release(true)
  await reconciliation
  expect(coordinator.getSnapshot()).toMatchObject({ phase: "mutation", token: second })
  const staleRead = vi.fn()
  await coordinator.reconcile(first, staleRead)
  expect(staleRead).not.toHaveBeenCalled()
  coordinator.release(second)
  await coordinator.reconcile(second, staleRead)
  coordinator.release(second)
  expect(coordinator.getSnapshot().phase).toBe("idle")
})

it("ignores a failed stale read after a new mutation owns coordination", async () => {
  const coordinator = mfaCoordinatorFor({})
  const first = coordinator.begin("disable")!
  let reject!: (reason: Error) => void
  const gate = new Promise<boolean>((_resolve, rejectRead) => { reject = rejectRead })
  const reconciliation = coordinator.reconcile(first, () => gate)
  coordinator.release(first)
  const second = coordinator.begin("enable", "authy")!
  reject(new Error("Late failed identity read"))
  await reconciliation
  expect(coordinator.getSnapshot()).toMatchObject({ phase: "mutation", token: second })
})
