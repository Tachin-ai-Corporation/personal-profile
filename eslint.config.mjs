import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

// Shared rule options. ESLint flat config REPLACES a rule's options when a
// later block redefines it, so every block that redefines one of these rules
// spreads the shared entries back in.

/** Server env is read only in lib/server/env.ts (AD-3). */
const PROCESS_ENV_RESTRICTION = {
  object: "process",
  property: "env",
  message:
    "Read server env only via lib/server/env.ts; client code may read process.env.NEXT_PUBLIC_APP_ENV only in lib/shared/app-env.ts.",
}

const FETCH_MESSAGE = "Use callApi from @/lib/api — it is the only browser transport (AD-19)."

/** `window.fetch`, `globalThis.fetch`, `self.fetch` (AD-19). */
const FETCH_PROPERTY_RESTRICTIONS = ["window", "globalThis", "self"].map((object) => ({
  object,
  property: "fetch",
  message: FETCH_MESSAGE,
}))

const SWR_KEY_MESSAGE = 'Build SWR keys with keys.* from @/lib/api/keys (AD-10); inline keys are banned.'
const SWR_FN = "/^(useSWR|useSWRImmutable|useSWRMutation|useSWRSubscription|mutate|preload)$/"
const SWR_MEMBER_FN = "/^(mutate|preload)$/"
const INLINE_KEY_ARG = [
  '[arguments.0.type="ArrayExpression"]',
  '[arguments.0.type="TemplateLiteral"]',
  '[arguments.0.type="Literal"][arguments.0.raw=/^["\']/]',
]

/** Global no-restricted-syntax entries: dangerouslySetInnerHTML + inline SWR keys. */
const RESTRICTED_SYNTAX = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: "dangerouslySetInnerHTML is banned (AD-11); render data-derived content through safeHref/escaping.",
  },
  ...INLINE_KEY_ARG.map((arg) => ({
    selector: `CallExpression[callee.type="Identifier"][callee.name=${SWR_FN}]${arg}`,
    message: SWR_KEY_MESSAGE,
  })),
  ...INLINE_KEY_ARG.map((arg) => ({
    selector: `CallExpression[callee.type="MemberExpression"][callee.property.name=${SWR_MEMBER_FN}]${arg}`,
    message: SWR_KEY_MESSAGE,
  })),
]

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
    // banned (AD-3, AD-11, AD-21). SWR keys come only from lib/api/keys.ts (AD-10).
    rules: {
      "no-restricted-properties": ["error", PROCESS_ENV_RESTRICTION],
      "no-restricted-syntax": ["error", ...RESTRICTED_SYNTAX],
    },
  },
  {
    // callApi is the only browser transport (AD-19): no fetch in client code
    // outside lib/api/client.ts.
    files: ["features/**/*.{ts,tsx,js,jsx,mjs}", "components/**/*.{ts,tsx,js,jsx,mjs}", "lib/api/**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: ["lib/api/client.ts", "**/*.test.*"],
    rules: {
      "no-restricted-globals": ["error", { name: "fetch", message: FETCH_MESSAGE }],
      "no-restricted-properties": ["error", PROCESS_ENV_RESTRICTION, ...FETCH_PROPERTY_RESTRICTIONS],
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
