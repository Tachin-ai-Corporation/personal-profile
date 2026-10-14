# Building on the 1health platform — API guide

> **Personal Profile (spec 7.0a):** the template's generic engines (`query`,
> `schema`, `grid`, `custom-data`, workflow, campaign, journey and provisioning
> modules) were removed: none of those endpoints is on the proxy allowlist.
> These docs stay as **platform reference only**. In this app the browser calls
> 1health only through the BFF proxy with `callApi`; see
> [CONVENTIONS.md](CONVENTIONS.md) and [../AUTH-ARCHITECTURE.md](../AUTH-ARCHITECTURE.md).

**Start here if you're building features on this template.** These docs distill
the reusable 1health API patterns (extracted from a full production app) into
generic, copy-ready building blocks. Every concept below ships as typed code in
[`lib/api/`](../../lib/api) — the docs explain the *why* and the *shape*; the
code is the *how*.

> All examples use **placeholder** type names, attribute names, and field labels.
> Your app supplies its own (from 1health's schema/config). Nothing here is
> hardwired to a specific product.

## The 60-second mental model

- **The platform is a typed object graph.** A **data object type** is a
  PascalCase **string** (`"Person"`, `"Organization"`, `"WorkflowTemplate"`) —
  not a GUID. An **instance** is a numeric `id`.
- **Two read engines:** the generic [`/api/v2/query`](QUERY.md) (flexible
  entity + relationship reads) and the [grid endpoints](QUERY.md#grid-endpoints)
  (`/api/v3/health/grid/<view>`, pre-flattened lists).
- **One write-extension mechanism:** every instance has a schemaless
  [`customData`](CUSTOM-DATA.md) JSON blob.
- **The schema is introspectable:** fetch the list of types and any type's
  attributes + relationships at runtime — see [SCHEMA-DISCOVERY.md](SCHEMA-DISCOVERY.md).
- **Workflows** are [Campaign → Template → **Journey** (instance) → Steps](WORKFLOWS.md).
  You advance a journey by **submitting its actionable step**.
- **Apps can self-provision:** find-or-clone the workflow template and create a
  campaign on any fresh tenant, by name — see [PROVISIONING.md](PROVISIONING.md).
- **Templates clone down four layers** (global → tenant → campaign base →
  per-journey); *where you edit config determines its scope* (e.g. notification
  settings live on the campaign template) — see
  [PROVISIONING.md § template layers](PROVISIONING.md#the-four-template-layers-where-you-edit-matters).
- **Everything goes through `callApi`** and the server-side proxy (Bearer token
  and upstream origin are added server-side). See [CONVENTIONS.md](CONVENTIONS.md).

## The one distinction that trips everyone up

"Attribute" means **two different things**:

| | Schema attribute | Dynamic step-field |
|---|---|---|
| Used for | `/api/v2/query` projections & filters | workflow step form fields |
| Identifier | a plain **string** (`"birthDate"`) | a **GUID** (`fieldIdentifier`) |
| Where it comes from | discoverable via `/type/key` (or hardcoded) | **fetched at runtime**, matched by `label` |
| Stable across envs? | yes | **NO — differs demo vs prod** |

Never hardcode a step-field GUID. See [DATA-MODEL.md § Attributes](DATA-MODEL.md#attributes-two-meanings).

## Documents

| Doc | What it covers |
|---|---|
| [DATA-MODEL.md](DATA-MODEL.md) | Object types, instances, attributes (both senses), `customData`, type↔REST-path map |
| [SCHEMA-DISCOVERY.md](SCHEMA-DISCOVERY.md) | Fetch types/attributes/relationships at runtime; type-aware filtering; fully dynamic queries |
| [QUERY.md](QUERY.md) | `/api/v2/query` (RSQL operators, relationships, response prefixes) + grid endpoints |
| [CUSTOM-DATA.md](CUSTOM-DATA.md) | Reading/writing `customData`, APPEND vs REPLACE, `appData` namespacing, delete-by-omission |
| [WORKFLOWS.md](WORKFLOWS.md) | Campaign/template/journey/step model, lifecycle, the 3 step-submission recipes, attachments, comments |
| [PROVISIONING.md](PROVISIONING.md) | The four template layers (global→tenant→campaign→journey) & where-to-edit scope · self-bootstrap: find/clone/publish + create/activate/share, by name |
| [DYNAMIC-STEPS.md](DYNAMIC-STEPS.md) | Building step UIs generically with `DynamicStepForm` |
| [CONVENTIONS.md](CONVENTIONS.md) | How to add a new API module; the `callApi` + `ApiResponse` pattern |
| [GOTCHAS.md](GOTCHAS.md) | The full list of platform quirks to code defensively around |

## Code map

```
lib/api/
  client.ts            callApi (same-origin transport, refresh, session events)
  types.ts             ApiResponse
  errors-codes.ts      error-envelope parsing (BFF errorCode vs upstream code)
  session-events.ts    session-expired (published once)
  log-api-call.ts      dev-only console logger (redacted)
  refresh-coordinator.ts  single-flight refresh (+ navigator.locks)
  keys.ts              SWR keys ["pp", ...] + mutateMyself / mutateContactPoints
  fetcher.ts           shared SWR fetcher + registerFetcher (one loader per key family)
  config.ts            proxyPath() (modules own their paths)
  errors/<area>.ts     mapApiError(sectionId, …) core + per-area exact-message tables
  myself.ts            fetchMyself → Myself, isProctor, isTenantMember
  contact-points.ts    fetchContactPoints → ContactPoint[], primaryPhoneRegion
  session.ts           startSession (/api/token) / endSession (logout)
  index.ts             barrel — import everything from "@/lib/api"
lib/server/proxy/      allowlist/<area>.ts, deny list, normalization, forwarding
lib/shared/messages/   message catalog, one <area>.ts per area
```
