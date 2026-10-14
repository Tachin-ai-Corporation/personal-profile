import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

/**
 * Layering (ARCHITECTURE-SPINE): lib/server (server-only) · lib/api (client,
 * same-origin /api/* only) · lib/shared (pure, isomorphic) · features/<id> ·
 * components/ui. The boundaries below are enforced, not just documented.
 */

const ban = {
  processEnv: {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: "Read configuration through lib/server/env.ts only.",
  },
  fetch: {
    selector: "CallExpression[callee.name='fetch']",
    message: "Use callApi (lib/api/client.ts); only lib/server/** may call fetch upstream.",
  },
  dangerousHtml: {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: "dangerouslySetInnerHTML is banned (AD-11).",
  },
  nextRedirect: {
    selector: "MemberExpression[object.name='NextResponse'][property.name='redirect']",
    message: "Use seeOther() from lib/server/http/responses.ts (AD-4).",
  },
  referrer: {
    selector: "MemberExpression[object.name='document'][property.name='referrer']",
    message: "document.referrer is read only by the /auth screen, for display (D2).",
  },
  nextLink: {
    selector: "ImportDeclaration[source.value='next/link']",
    message: "Cross-page and external navigation go through features/shell navigate() (AD-26).",
  },
  internalHref: {
    selector: "JSXAttribute[name.name='href'][value.type='Literal'][value.value=/^\\/(account|handoff)?([/?#].*)?$|1health\\.io/]",
    message: "Links to /, /account, /handoff/** or 1health go through features/shell navigate() (AD-26).",
  },
  portalHref: {
    selector: "JSXAttribute[name.name='href'] Identifier[name=/portalUrl/i]",
    message: "Links to the portal go through features/shell navigate() (AD-26).",
  },
  inlineSwrKey: {
    selector: "CallExpression[callee.name=/^(useSWR|useSWRImmutable|mutate)$/][arguments.0.type='ArrayExpression']",
    message: "Build SWR keys with lib/api/keys.ts (AD-10).",
  },
}

const syntax = (...rules) => ["error", ...rules]
const ALL = Object.values(ban)
const without = (...names) => Object.entries(ban).filter(([name]) => !names.includes(name)).map(([, rule]) => rule)

const imports = (...patterns) => ["error", { patterns }]
const group = (list, message) => ({ group: list, message })

const SERVER_ONLY = group(["@/lib/server", "@/lib/server/*", "server-only"], "lib/server is server-only.")
const FEATURES = group(["@/features", "@/features/*"], "This layer may not import features.")
const CLIENT_API = group(["@/lib/api", "@/lib/api/*"], "This layer may not import lib/api.")
const APP = group(["@/app", "@/app/*"], "Nothing imports from app/.")
const COMPONENTS = group(["@/components", "@/components/*"], "This layer may not import components.")
const OTHER_FEATURES = group(
  ["@/features/*", "!@/features/shell", "!@/features/shell/*"],
  "Features import only features/shell (relative imports inside a feature).",
)

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
      "next-env.d.ts",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },

  // --- Syntax bans (later blocks override earlier ones for their files) ----
  { files: ["**/*.{ts,tsx,js,jsx,mjs}"], rules: { "no-restricted-syntax": syntax(...ALL) } },
  { files: ["lib/server/**"], rules: { "no-restricted-syntax": syntax(...without("fetch")) } },
  { files: ["lib/server/env.ts"], rules: { "no-restricted-syntax": syntax(...without("fetch", "processEnv")) } },
  { files: ["lib/api/client.ts"], rules: { "no-restricted-syntax": syntax(...without("fetch")) } },
  { files: ["lib/api/keys.ts"], rules: { "no-restricted-syntax": syntax(...without("inlineSwrKey")) } },
  { files: ["lib/shared/app-env.ts"], rules: { "no-restricted-syntax": syntax(...without("processEnv")) } },
  // The shell and the /auth screen own navigation and the display-only referrer (AD-26, D2).
  {
    files: ["features/shell/**", "app/auth/**"],
    rules: { "no-restricted-syntax": syntax(...without("nextLink", "internalHref", "portalHref")) },
  },
  {
    files: ["features/shell/auth-screen.tsx", "app/auth/**"],
    rules: { "no-restricted-syntax": syntax(...without("nextLink", "internalHref", "portalHref", "referrer")) },
  },
  // Tests and tooling (not app code): fetch for MSW tests; env for runner config.
  { files: ["**/*.test.{ts,tsx}", "test/**", "e2e/**"], rules: { "no-restricted-syntax": syntax(...without("fetch")) } },
  {
    files: ["*.config.{ts,mjs,js}"],
    rules: { "no-restricted-syntax": syntax(...without("fetch", "processEnv")) },
  },

  // --- Import boundaries ---------------------------------------------------
  {
    files: ["lib/shared/**"],
    rules: { "no-restricted-imports": imports(SERVER_ONLY, FEATURES, CLIENT_API, APP, COMPONENTS) },
  },
  { files: ["lib/api/**"], rules: { "no-restricted-imports": imports(SERVER_ONLY, FEATURES, APP, COMPONENTS) } },
  { files: ["lib/server/**"], rules: { "no-restricted-imports": imports(FEATURES, CLIENT_API, APP, COMPONENTS) } },
  { files: ["features/**"], rules: { "no-restricted-imports": imports(SERVER_ONLY, APP, OTHER_FEATURES) } },
  { files: ["components/**", "hooks/**"], rules: { "no-restricted-imports": imports(SERVER_ONLY, FEATURES, APP) } },
  {
    files: ["components/ui/**"],
    rules: { "no-restricted-imports": imports(SERVER_ONLY, FEATURES, APP, CLIENT_API) },
  },
]

export default eslintConfig
