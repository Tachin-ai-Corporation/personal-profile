import { act, renderHook, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { beforeEach, expect, it, vi } from "vitest"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import { TestProviders } from "@/test/providers"
import { fetchMyself, sessionEvents } from "@/lib/api"
import { useAuthenticatorController, type AuthenticatorControllerProps } from "./use-authenticator-controller"

vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(), toastPartial: vi.fn() }))
const DISABLE = "/api/1h/v2/mfa/disable/totp"
const ENABLE = "/api/1h/v2/mfa/enable/totp"
const VALIDATE = "/api/pp/mfa/validate"
const MYSELF = "/api/1h/v2/user/myself"
const QR = "data:image/png;base64,aGVsbG8="
const props = (linked: boolean): AuthenticatorControllerProps => ({ cardProps: { state: "ready", linked, onRetry: vi.fn() }, onFailure: vi.fn() })
beforeEach(async () => { server.use(http.get(MYSELF, () => HttpResponse.json(myselfWire()))); await fetchMyself() })

// These tests call the hook's event API synchronously to model repeated/reentrant
// handlers before React commits busy controls. Normal DOM paths use userEvent in feature suites.
it("guards incompatible activations and single-flights repeated confirm handlers before a render", async () => {
  let release!: () => void
  let calls = 0
  const gate = new Promise<void>((resolve) => { release = resolve })
  server.use(http.post(DISABLE, async () => { calls++; await gate; return new HttpResponse(null) }))
  const { result, rerender } = renderHook(useAuthenticatorController, { initialProps: props(true), wrapper: TestProviders })
  await act(async () => { await result.current.start("google"); await result.current.submit(); await result.current.confirmDisable() })
  expect(calls).toBe(0)
  act(() => result.current.openDisable())
  act(() => result.current.openDisable())
  let first!: Promise<void>
  act(() => { first = result.current.confirmDisable(); void result.current.confirmDisable(); result.current.cancelDisable() })
  await waitFor(() => expect(calls).toBe(1))
  expect(result.current.confirming).toBe(true)
  act(() => result.current.openDisable())
  rerender(props(false))
  await act(async () => { await result.current.start("authy") })
  expect(result.current.enrollment).toBeNull()
  await act(async () => { release(); await first })
})

it("gates duplicate enrollment starts and suppresses event callbacks after session transfer", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let calls = 0
  server.use(http.post(ENABLE, async () => { calls++; await gate; return HttpResponse.json({ qrCode: QR }) }))
  const { result } = renderHook(useAuthenticatorController, { initialProps: props(false), wrapper: TestProviders })
  act(() => result.current.openDisable())
  let pending!: Promise<void>
  act(() => { pending = result.current.start("google"); void result.current.start("authy") })
  await waitFor(() => expect(calls).toBe(1))
  act(() => sessionEvents.publish("session-expired"))
  // A late close callback after shell takeover must neither refetch nor focus.
  act(() => { result.current.cancelLink(); result.current.restoreLinkFocus(); result.current.restoreDisableFocus() })
  await act(async () => { release(); await pending })
  expect(result.current.enrollment).toBeNull()
  expect(calls).toBe(1)
})

it("keeps validation coordination when the QR fails while validation is pending", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  server.use(http.post(ENABLE, () => HttpResponse.json({ qrCode: QR })), http.post(VALIDATE, async () => { await gate; return HttpResponse.json(true) }))
  const { result } = renderHook(useAuthenticatorController, { initialProps: props(false), wrapper: TestProviders })
  await act(async () => { await result.current.start("google") })
  act(() => result.current.changeCode("123456"))
  let pending!: Promise<void>
  act(() => { pending = result.current.submit(); void result.current.submit(); result.current.cancelLink() })
  expect(result.current.enrollment).not.toBeNull()
  act(() => result.current.brokenQr())
  expect(result.current.enrollment).toBeNull()
  await act(async () => { release(); await pending })
})


it("rejects an older enrollment's validation event while a replacement controller owns an enable request", async () => {
  let enables = 0
  let validations = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  server.use(
    http.post(ENABLE, async () => { if (++enables === 2) await gate; return HttpResponse.json({ qrCode: QR }) }),
    http.post(VALIDATE, () => { validations++; return HttpResponse.json(true) }),
  )
  // Independent local snapshots share one cache lease during overlapping panel lifetimes.
  const { result } = renderHook(() => ({
    previous: useAuthenticatorController(props(false)),
    replacement: useAuthenticatorController(props(false)),
  }), { wrapper: TestProviders })
  await act(async () => { await result.current.previous.start("google") })
  act(() => result.current.previous.changeCode("123456"))
  let pending!: Promise<void>
  act(() => { pending = result.current.replacement.start("authy") })
  await waitFor(() => expect(enables).toBe(2))
  await act(async () => { await result.current.previous.submit() })
  expect(validations).toBe(0)
  await act(async () => { release(); await pending })
})
