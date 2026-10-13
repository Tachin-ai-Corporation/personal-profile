import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "_bmad/**",
      "_bmad-output/**",
      ".claude/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  {
    // Server env is read only in lib/server/env.ts; client code reads only
    // NEXT_PUBLIC_APP_ENV in lib/shared/app-env.ts. dangerouslySetInnerHTML is
    // banned (AD-3, AD-11, AD-21).
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Read server env only via lib/server/env.ts; client code may read process.env.NEXT_PUBLIC_APP_ENV only in lib/shared/app-env.ts.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: "dangerouslySetInnerHTML is banned (AD-11); render data-derived content through safeHref/escaping.",
        },
      ],
    },
  },
  {
    // The single allowed server reader of process.env.
    files: ["lib/server/env.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },
  {
    // Tests and tooling may set/read process.env to exercise the env reader.
    files: ["**/*.test.{ts,tsx}", "vitest.config.ts", "playwright.config.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },
]

export default eslintConfig
