# Local dependency patches

## braces 3.0.3 — bounded string-pattern nesting

`braces@3.0.3.patch` mitigates [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) in the development dependency chain:

`eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`.

The parser rejects string patterns whose active brace/parenthesis AST depth exceeds 100, with a controlled `SyntaxError`, before allocating the next recursive node. Both node kinds count toward the same limit, including mixed nesting and unclosed inputs. Escaped, quoted and bracketed literals retain upstream handling. Existing length/range limits remain in place. This intentionally rejects unusually deep tooling patterns; ordinary project globs continue to work.

The mitigation covers patterns parsed from strings by the callable API, `create`, `parse`, `compile`, `expand` and `stringify`. It does not validate caller-constructed AST objects or claim to solve every regex/glob resource-exhaustion scenario. No application endpoint accepts user-supplied glob patterns.

pnpm applies the version-specific patch through `patchedDependencies` in `pnpm-workspace.yaml`; the generated lockfile records its hash. Commit all three files together. Do not edit `node_modules` or enable unused/failed-patch bypasses. See [pnpm patch](https://pnpm.io/cli/patch).

Run `corepack pnpm vitest run scripts/braces-mitigation.test.ts` to verify the installed package through the actual ESLint dependency chain. Tests cover hostile nesting, the exact limit, literal syntax, many shallow groups and normal fast-glob results. The same tests pass after a clean frozen offline install.

The package still reports version 3.0.3. Registry audits therefore continue to report the advisory; no audit ignore rule is added. Production high/critical dependency auditing remains a CI gate, and the mitigation regression tests run in the normal unit suite. Track the official advisory separately and remove this patch/registration only when the dependency chain resolves to an upstream corrected release; regenerate the lockfile and rerun regression tests and lint.

## @radix-ui/react-tooltip 1.2.16 — retain focused descriptions during ancestor scroll

`@radix-ui__react-tooltip@1.2.16.patch` changes only the ancestor-scroll close condition in the package's CommonJS (`dist/index.js`) and ESM (`dist/index.mjs`) entrypoints. A trigger that still owns focus, checked through `trigger.ownerDocument.activeElement`, keeps its description when browser focus scrolling moves an ancestor. Hover-only tooltips still close on ancestor scroll. Escape, blur, outside dismissal, positioning, input handling and provider timing retain upstream behavior.

The guard runs before Radix calls `onClose`, preserving the provider's open state and skip-delay timer. Rejecting the close in the app's controlled `onOpenChange` handler is too late: Radix has already notified its provider, which reintroduces the hover delay despite the description staying open. The application wrapper remains unchanged.

pnpm applies this version-specific patch through `patchedDependencies` in `pnpm-workspace.yaml`; the generated lockfile records its hash. Commit the patch, registration and lockfile together. Do not edit `node_modules` or enable unused/failed-patch bypasses.

Run `corepack pnpm vitest run components/ui/tooltip.test.tsx components/ui/disabled-action.test.tsx components/ui/info-icon-button.test.tsx` for focus/scroll, explicit dismissal, ordinary touch/pen, protected presses and the paired shared-provider regression. `PP_E2E_PORT=3200 corepack pnpm test:e2e e2e/primitives.spec.ts` checks actual root/nested focus scrolling, retained exact descriptions, pointer-only scroll dismissal and the original primitives on desktop and 360 px, with light/dark checks. Verify installation with `corepack pnpm install --frozen-lockfile --offline`.

Remove the patch and its registration only when a deliberately evaluated upstream Tooltip release preserves focused descriptions through ancestor focus scrolling without changing dismissal or provider timing. Regenerate the lockfile and rerun the control tests and native browser regressions when upgrading or removing the patch; do not carry this distribution patch blindly to another version.
