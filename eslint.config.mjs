import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

// Shared rule options. ESLint flat config REPLACES a rule's options when a
// later block redefines it, so every block that redefines one of these rules
// spreads the shared entries back in.

/** Server env is read only in lib/server/env.ts (D1); the one other reader is lib/shared/app-env.ts (D6). */
const PROCESS_ENV_RESTRICTION = {
  object: "process",
  property: "env",
  message:
    "Read server env only via lib/server/env.ts; elsewhere use isLocalDev() from lib/shared/app-env.ts (the only other process.env reader, NODE_ENV only).",
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

/**
 * `lib/shared/app-env.ts` may read `process.env.NODE_ENV` and nothing else (D6):
 * any other member, a computed member or a bare `process.env` fails.
 */
const APP_ENV_ONLY_NODE_ENV = {
  selector:
    'MemberExpression[object.name="process"][property.name="env"]:not(MemberExpression[computed=false][property.name="NODE_ENV"] > MemberExpression.object)',
  message: "lib/shared/app-env.ts may read only process.env.NODE_ENV (D6).",
}

/** Hand-off routes redirect with lib/server/http.ts#seeOther(), never NextResponse.redirect (AD-4). */
const NO_NEXT_REDIRECT = {
  selector: 'MemberExpression[object.name="NextResponse"][property.name="redirect"]',
  message: "Use seeOther() from lib/server/http.ts in app/handoff/** (AD-4), not NextResponse.redirect.",
}

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
    // Server env is read only in lib/server/env.ts; lib/shared/app-env.ts reads
    // only NODE_ENV (D1, D6). dangerouslySetInnerHTML is banned (AD-11, AD-21).
    // SWR keys come only from lib/api/keys.ts (AD-10).
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
    // The shared app-env helper: process.env.NODE_ENV only (D6).
    files: ["lib/shared/app-env.ts"],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": ["error", ...RESTRICTED_SYNTAX, APP_ENV_ONLY_NODE_ENV],
    },
  },
  {
    // Hand-off routes (Epic 7) answer with seeOther(), never NextResponse.redirect (AD-4).
    files: ["app/handoff/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...RESTRICTED_SYNTAX, NO_NEXT_REDIRECT],
    },
  },
  {
    // Tests and tooling may set/read process.env to exercise the env reader.
    files: ["**/*.test.{ts,tsx}", "vitest.config.ts", "playwright.config.ts", "next.config.mjs", "eslint.config.mjs"],
    rules: {
      "no-restricted-properties": "off",
    },
  },
]

export default eslintConfig
