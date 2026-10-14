import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach } from "vitest"
import { sessionEvents } from "@/lib/api"
import { resetTestNavigation } from "./next-navigation"

// Each test starts with no session event published (the page-lifetime instance is shared).
beforeEach(() => sessionEvents.reset())

afterEach(() => {
  cleanup()
  resetTestNavigation()
})
