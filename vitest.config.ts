import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL(".", import.meta.url))

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
          include: ["lib/server/**/*.test.ts", "lib/shared/**/*.test.ts", "lib/*.test.ts", "app/api/**/*.test.ts", "app/disabled/*.test.ts", "app/*.test.ts", "scripts/**/*.test.ts", "test/**/*.test.ts", "*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "client",
          environment: "jsdom",
          setupFiles: ["test/setup-dom.ts"],
          include: ["lib/api/**/*.test.ts", "features/**/*.test.{ts,tsx}", "components/**/*.test.tsx", "app/**/*.test.tsx", "test/**/*.test.tsx"],
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
