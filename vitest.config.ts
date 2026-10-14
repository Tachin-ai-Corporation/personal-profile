import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const rootDir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Project path alias (mirrors tsconfig `@/*`).
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` is a build-time Next alias; stub it for tests.
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    globals: true,
    // Component tests default to jsdom; pure server modules opt into node with a
    // `// @vitest-environment node` docblock (e.g. lib/server/env.test.ts).
    environment: "jsdom",
    environmentOptions: {
      // Fix the document origin so same-origin `/api/...` fetches resolve to a
      // known URL that MSW handlers can match.
      jsdom: { url: "http://localhost:3000" },
    },
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**", "_bmad/**", "_bmad-output/**"],
    root: rootDir,
  },
})
