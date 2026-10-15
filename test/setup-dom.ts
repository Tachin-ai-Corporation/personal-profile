import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach } from "vitest"
import { activity, sessionEvents } from "@/lib/api"
import { resetTestNavigation } from "./next-navigation"

// Each test starts with no session event published and no activity recorded
// (the page-lifetime instances are shared).
beforeEach(() => {
  sessionEvents.reset()
  activity.reset()
})

afterEach(() => {
  cleanup()
  resetTestNavigation()
  activity.reset()
})
