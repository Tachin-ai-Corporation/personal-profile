import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL(".", import.meta.url))

/**
 * Every `*.test.ts(x)` outside node_modules, e2e/ and build output belongs to
 * exactly one project (spec R5-2; `vitest.config.test.ts` fails otherwise):
 * `.ts` under the server side and tooling runs in node, `.tsx` and the
 * browser-side folders in jsdom.
 */
export const SERVER_TESTS = ["lib/server/**/*.test.ts", "lib/shared/**/*.test.ts", "lib/*.test.ts", "app/**/*.test.ts", "scripts/**/*.test.ts", "test/**/*.test.ts", "*.test.ts"]
export const CLIENT_TESTS = [
  "lib/api/**/*.test.ts",
  "lib/**/*.test.tsx",
  "features/**/*.test.{ts,tsx}",
  "components/**/*.test.{ts,tsx}",
  "hooks/**/*.test.{ts,tsx}",
  "contexts/**/*.test.{ts,tsx}",
  "app/**/*.test.tsx",
  "test/**/*.test.tsx",
  "*.test.tsx",
]

export default defineConfig({
  resolve: {
    alias: {
      "@/": root,
      "server-only": `${root}test/stubs/server-only.ts`,
    },
  },
  test: {
    setupFiles: ["test/setup.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: SERVER_TESTS,
        },
      },
      {
        extends: true,
        test: {
          name: "client",
          environment: "jsdom",
          setupFiles: ["test/setup-dom.ts"],
          include: CLIENT_TESTS,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["lib/server/**/*.ts", "lib/api/**/*.ts", "lib/shared/**/*.ts"],
      exclude: ["**/*.test.ts"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
})
