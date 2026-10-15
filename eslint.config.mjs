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
  /** Bare `fetch(…)` and `window.fetch` / `globalThis.fetch` / `self.fetch` (AD-19). */
  fetch: [
    {
      selector: "CallExpression[callee.name='fetch']",
      message: "Use callApi (lib/api/client.ts); only lib/server/** may call fetch upstream.",
    },
    {
      selector: "MemberExpression[object.name=/^(window|globalThis|self)$/][property.name='fetch']",
      message: "Use callApi (lib/api/client.ts); only lib/server/** may call fetch upstream.",
    },
  ],
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
  /** AD-9: a dynamic import could reach `updateAccount()` around the import rule. */
  dynamicAccount: {
    selector: "ImportExpression[source.value=/(^|\\/)lib\\/api(\\/index|\\/account)?(\\.ts)?$/]",
    message: "lib/api is imported statically; updateAccount() is importable only in features/account (AD-9).",
  },
  /**
   * AD-10: an array, template or string literal as the key of any SWR entry
   * point, called bare or as a member (`cache.mutate([…])`); `keys.*` is fine.
   */
  inlineSwrKey: [
    "CallExpression[callee.type='Identifier'][callee.name=/^(useSWR|useSWRImmutable|useSWRMutation|useSWRSubscription|mutate|preload)$/]",
    "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(mutate|preload)$/]",
  ].flatMap((call) =>
    ["[arguments.0.type='ArrayExpression']", "[arguments.0.type='TemplateLiteral']", "[arguments.0.type='Literal'][arguments.0.raw=/^[\"']/]"].map((arg) => ({
      selector: `${call}${arg}`,
      message: "Build SWR keys with lib/api/keys.ts (AD-10).",
    })),
  ),
}

/**
 * `lib/shared/app-env.ts` may read `process.env.NODE_ENV` and nothing else (D6):
 * any other member, a computed member or a bare `process.env` fails.
 */
const APP_ENV_ONLY_NODE_ENV = {
  selector:
    "MemberExpression[object.name='process'][property.name='env']:not(MemberExpression[computed=false][property.name='NODE_ENV'] > MemberExpression.object)",
  message: "lib/shared/app-env.ts may read only process.env.NODE_ENV (D6).",
}

/**
 * Zod messages come from the catalog (AD-11): in every feature `schema.ts` a
 * string or template literal (also inside a conditional, `||`/`??`, or
 * returned from an error function) may not be a message. Only zod's
 * message-taking positions are checked, so `.padStart(2, "0")` or
 * `.replace(x, " ")` are fine.
 */
const ZOD_LITERAL_MESSAGE = "Zod messages come from the message catalog (lib/shared/messages), not string literals (AD-11)."
const LITERALS = ["Literal[raw=/^[\"']/]", "TemplateLiteral"]
/** A literal at `node`, or as a branch of a conditional / logical expression at `node`. */
const literalAt = (parent, position = "") =>
  LITERALS.flatMap((literal) => [
    `${parent} > ${literal}${position}`,
    `${parent} > ConditionalExpression${position} > ${literal}`,
    `${parent} > LogicalExpression${position} > ${literal}`,
  ])
/** Methods whose only argument is the message (`.email("x")`). */
const MESSAGE_FIRST = "nonempty|email|url|uuid|guid|cuid|cuid2|ulid|nanoid|emoji|ipv4|ipv6|e164|jwt|base64|hostname|int|positive|negative|nonnegative|nonpositive|finite|safe|date|datetime|time|duration"
/** Methods whose second argument is the message (`.min(1, "x")`). */
const MESSAGE_SECOND = "min|max|length|size|regex|startsWith|endsWith|includes|gt|gte|lt|lte|multipleOf|step|refine|literal|enum"
/** `z.<type>("x")` constructors that take the message first. */
const Z_TYPES = "string|number|boolean|bigint|symbol|date|nan|email|url|uuid|guid|cuid|cuid2|ulid|nanoid|emoji|ipv4|ipv6|e164|jwt|base64|hostname|int|int32|float32|float64"
const MESSAGE_PROPERTY = "Property[key.name=/^(message|error)$/]"
const zodLiteralMessages = [
  ...literalAt(`CallExpression[callee.property.name=/^(${MESSAGE_FIRST})$/]`, ":nth-child(1)"),
  ...literalAt(`CallExpression[callee.property.name=/^(${MESSAGE_SECOND})$/]`, ":nth-child(2)"),
  ...literalAt(`CallExpression[callee.object.name='z'][callee.property.name=/^(${Z_TYPES})$/]`, ":nth-child(1)"),
  ...literalAt("CallExpression[callee.object.name='z']", ":nth-child(2)"),
  ...literalAt("CallExpression[callee.object.property.name=/^(coerce|iso)$/]", ":nth-child(1)"),
  ...literalAt(MESSAGE_PROPERTY),
  ...literalAt(`${MESSAGE_PROPERTY} > :function`),
  ...literalAt(`${MESSAGE_PROPERTY} :function ReturnStatement`),
].map((selector) => ({ selector, message: ZOD_LITERAL_MESSAGE }))

/**
 * AD-23 / Story 9.1 (spec F7-2): the NPI type is fixed inside
 * `lib/api/npi.ts` (`personalNpiSearchPath` = 1, `practiceNpiSearchPath` = 2);
 * no Provider feature code names `entityTypeCode` (its tests may assert the
 * request URL).
 */
const NPI_TYPE_MESSAGE = "features/provider never names entityTypeCode: lib/api/npi.ts fixes the NPI type (AD-23, Story 9.1)."
const npiTypeInFeature = [
  "Identifier[name=/entity_?type_?code/i]",
  "JSXIdentifier[name=/entity_?type_?code/i]",
  "Literal[value=/entity_?type_?code/i]",
  "TemplateElement[value.raw=/entity_?type_?code/i]",
  "JSXText[value=/entity_?type_?code/i]",
].map((selector) => ({ selector, message: NPI_TYPE_MESSAGE }))

const syntax = (...rules) => ["error", ...rules.flat()]
const ALL = Object.values(ban).flat()
const without = (...names) => Object.entries(ban).filter(([name]) => !names.includes(name)).flatMap(([, rule]) => rule)

/** `no-restricted-imports` options: pattern groups plus exact-name `paths` (a block's options replace earlier blocks'). */
const imports = (patterns, paths = []) => ["error", { patterns, paths }]
const group = (list, message) => ({ group: list, message })

const SERVER_ONLY = group(["@/lib/server", "@/lib/server/*", "server-only"], "lib/server is server-only.")
const FEATURES = group(["@/features", "@/features/*"], "This layer may not import features.")
const CLIENT_API = group(["@/lib/api", "@/lib/api/*"], "This layer may not import lib/api.")
const APP = group(["@/app", "@/app/*"], "Nothing imports from app/.")
const COMPONENTS = group(["@/components", "@/components/*"], "This layer may not import components.")
/**
 * AD-9: `updateAccount()` is the sole builder of email/phoneNumber/phoneNumberRegion;
 * only features/account imports it — by alias or relative path, from the
 * module or the lib/api index (dynamic imports: the `dynamicAccount` ban).
 */
const UPDATE_ACCOUNT_MESSAGE = "updateAccount() is importable only in features/account (AD-9)."
const ACCOUNT_MODULE = { regex: "(^|/)lib/api/account(\\.ts)?$", message: UPDATE_ACCOUNT_MESSAGE }
const UPDATE_ACCOUNT = { regex: "(^|/)lib/api(/index(\\.ts)?)?$", importNames: ["updateAccount"], message: UPDATE_ACCOUNT_MESSAGE }
/** Toasts go through features/shell/toasts.ts (Story 1.12); `components/ui/toaster.tsx` renders them. */
const TOAST = { name: "@/hooks/use-toast", message: "Use the toast helpers of features/shell (toasts.ts); only it imports hooks/use-toast." }
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
  { files: ["lib/shared/app-env.ts"], rules: { "no-restricted-syntax": syntax(...without("processEnv"), APP_ENV_ONLY_NODE_ENV) } },
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
    files: ["*.config.{ts,mjs,js}", "e2e/server-env.ts"],
    rules: { "no-restricted-syntax": syntax(...without("fetch", "processEnv")) },
  },

  // --- Import boundaries ---------------------------------------------------
  { files: ["**/*.{ts,tsx,js,jsx,mjs}"], rules: { "no-restricted-imports": imports([ACCOUNT_MODULE, UPDATE_ACCOUNT], [TOAST]) } },
  {
    files: ["lib/shared/**"],
    rules: { "no-restricted-imports": imports([SERVER_ONLY, FEATURES, CLIENT_API, APP, COMPONENTS, ACCOUNT_MODULE, UPDATE_ACCOUNT], [TOAST]) },
  },
  { files: ["lib/api/**"], rules: { "no-restricted-imports": imports([SERVER_ONLY, FEATURES, APP, COMPONENTS], [TOAST]) } },
  { files: ["lib/server/**"], rules: { "no-restricted-imports": imports([FEATURES, CLIENT_API, APP, COMPONENTS, ACCOUNT_MODULE, UPDATE_ACCOUNT], [TOAST]) } },
  {
    files: ["features/**"],
    rules: { "no-restricted-imports": imports([SERVER_ONLY, APP, OTHER_FEATURES, ACCOUNT_MODULE, UPDATE_ACCOUNT], [TOAST]) },
  },
  { files: ["features/account/**"], rules: { "no-restricted-imports": imports([SERVER_ONLY, APP, OTHER_FEATURES], [TOAST]) } },
  {
    files: ["features/account/**"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: { "no-restricted-syntax": syntax(...without("dynamicAccount")) },
  },
  // toasts.ts owns hooks/use-toast; its test resets the shared queue between cases.
  {
    files: ["features/shell/toasts.ts", "features/shell/toasts.test.tsx"],
    rules: { "no-restricted-imports": imports([SERVER_ONLY, APP, OTHER_FEATURES, ACCOUNT_MODULE, UPDATE_ACCOUNT]) },
  },
  {
    files: ["components/**", "hooks/**"],
    rules: { "no-restricted-imports": imports([SERVER_ONLY, FEATURES, APP, ACCOUNT_MODULE, UPDATE_ACCOUNT], [TOAST]) },
  },
  {
    files: ["components/ui/**"],
    rules: { "no-restricted-imports": imports([SERVER_ONLY, FEATURES, APP, CLIENT_API, ACCOUNT_MODULE, UPDATE_ACCOUNT], [TOAST]) },
  },
  // The shadcn toast renderer and the hook itself.
  {
    files: ["components/ui/toaster.tsx", "hooks/use-toast.ts"],
    rules: { "no-restricted-imports": imports([SERVER_ONLY, FEATURES, APP, CLIENT_API, ACCOUNT_MODULE, UPDATE_ACCOUNT]) },
  },

  // --- Zod schemas take their messages from the catalog (AD-11) ------------
  { files: ["features/**/schema.ts"], rules: { "no-restricted-syntax": syntax(...ALL, ...zodLiteralMessages) } },

  // --- features/provider never names the NPI type (AD-23, Story 9.1; spec F7-2) ---
  { files: ["features/provider/**"], ignores: ["**/*.test.{ts,tsx}"], rules: { "no-restricted-syntax": syntax(...ALL, ...npiTypeInFeature) } },
  { files: ["features/provider/**/schema.ts"], rules: { "no-restricted-syntax": syntax(...ALL, ...zodLiteralMessages, ...npiTypeInFeature) } },
]

export default eslintConfig
