import type { Page } from "@playwright/test"
import { ANN } from "./core"

/** Synthetic PNG only; never enroll a real account in browser tests. */
const MFA_TEST_QRS = [
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC",
] as const
export const MFA_TEST_QR = MFA_TEST_QRS[0]

/** Stateful enrollment: one rotating response per activation, wrong/valid codes. */
export async function mockMfaEnrollment(page: Page, options: { baseMfaOff?: boolean; forbidden?: "enable" | "validate" } = {}) {
  const state = { enables: 0, validations: 0, linked: false, qrCode: "" }
  await page.route("**/api/1h/v2/user/myself", (route) => route.fulfill({ json: { ...ANN, mfaEnabled: !options.baseMfaOff, totpEnabled: state.linked } }))
  await page.route("**/api/1h/v2/mfa/enable/totp", async (route) => {
    state.enables++
    if (options.forbidden === "enable") { await route.fulfill({ status: 403, json: { message: "Denied" } }); return }
    if (options.baseMfaOff) { await route.fulfill({ status: 400, json: { message: "Mfa is not enabled for this user." } }); return }
    state.qrCode = MFA_TEST_QRS[(state.enables - 1) % MFA_TEST_QRS.length]
    await route.fulfill({ json: { qrCode: state.qrCode } })
  })
  await page.route("**/api/pp/mfa/validate", async (route) => {
    state.validations++
    if (options.forbidden === "validate") { await route.fulfill({ status: 403, json: { message: "Denied" } }); return }
    state.linked = route.request().postDataJSON().code === "123456"
    await route.fulfill({ json: state.linked })
  })
  return state
}

/** Synthetic TOTP-only removal; base MFA remains enabled in every status read. */
export async function mockMfaDisable(page: Page, options: { failure?: "error" | "forbidden" | "session" } = {}) {
  const state = { disables: 0, enables: 0, linked: true, mfaEnabled: true }
  await page.route("**/api/1h/v2/user/myself", (route) => route.fulfill({ json: { ...ANN, mfaEnabled: state.mfaEnabled, totpEnabled: state.linked } }))
  await page.route("**/api/1h/v2/mfa/enable/totp", (route) => { state.enables++; return route.fulfill({ json: { qrCode: MFA_TEST_QR } }) })
  await page.route("**/api/1h/v2/mfa/disable/totp", async (route) => {
    state.disables++
    if (options.failure === "session") { await route.fulfill({ status: 401, json: { errorCode: "SESSION_EXPIRED", source: "proxy" } }); return }
    if (options.failure === "forbidden") { await route.fulfill({ status: 403, json: { message: "Denied" } }); return }
    if (options.failure === "error") { await route.fulfill({ status: 500, json: { message: "Private upstream text" } }); return }
    state.linked = false
    await route.fulfill({ status: 200, body: "" })
  })
  return state
}
