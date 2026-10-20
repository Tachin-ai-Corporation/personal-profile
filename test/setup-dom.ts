import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach } from "vitest"
import { activity, pageUser, sessionEvents } from "@/lib/api"
import { resetTestNavigation } from "./next-navigation"

// Each test starts with no session event published, no activity recorded and
// no page user pinned (D-A) (the page-lifetime instances are shared).
beforeEach(() => {
  // jsdom has no layout; scrolling focused dialog actions is verified in Playwright.
  Element.prototype.scrollIntoView ??= () => {}
  sessionEvents.reset()
  activity.reset()
  pageUser.reset()
})

afterEach(() => {
  cleanup()
  resetTestNavigation()
  activity.reset()
})
