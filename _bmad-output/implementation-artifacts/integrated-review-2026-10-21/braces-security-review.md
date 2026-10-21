# Scope & method

Profile: Next.js framework app. Read-only security review restricted to the local braces depth mitigation, its regression tests, and pnpm patch persistence. Reviewed `.claude/agents/react-security-auditor.md`, `CLAUDE.md`, `patches/braces@3.0.3.patch`, `scripts/braces-mitigation.test.ts`, `pnpm-workspace.yaml`, lockfile patch references, installed patched braces parser/public entry points/recursive walkers, Vitest inclusion, and CI frozen install configuration. Used local file reads and searches; no network, installations, broad suites, repository edits, commit, or push. This report is the only written artifact. The project's CLAUDE.md lacks the specifically named Security, TypeScript & JavaScript core rules, and Framework apps sections; the auditor checklist supplied the security baseline within this restricted scope.

## Findings

No confirmed security findings in the reviewed change.

- The guard runs before allocation of either recursive AST node kind (`brace` or `paren`). The stack contains the root, so `stack.length > 100` permits 100 active nested nodes and rejects the 101st. Closing delimiters pop only the matching active node; mismatched or unmatched closers cannot decrement the stack and bypass the guard.
- Escapes and bracket classes are consumed before the guard. Quoted text is consumed as one literal by its existing branch, so braces and parentheses inside it never encounter the guard. Sequential shallow groups do not accumulate active depth. The intended compatibility change is rejection of structural nesting above 100, including invalid/unclosed and dollar-prefixed structures that still create recursive AST nodes.
- All public string entry points that can create deep ASTs route through the patched parser, including `create`, the callable API, `compile`, `expand`, and `stringify`. The short-input shortcut cannot carry excessive nesting. Internal parser stringification does not create additional structural depth. Direct caller-built ASTs are outside the requested mitigation scope.
- Workspace patch registration, lockfile digest, and micromatch dependency snapshot consistently select the patched braces version; the installed patched source contains the guard. CI uses `pnpm install --frozen-lockfile`.
- The focused tests cover balanced/unclosed/mixed nesting and parentheses across all four parser/walker entry points, the 100/101 threshold, shallow repetition, literal escapes/quotes/classes, ordinary expansion/compilation, and the actual Next ESLint -> fast-glob -> micromatch -> braces chain. Tests are included in the server Vitest project. The child-process stack limit, timeout, explicit error match, and nonzero-status checks make the regression assertions meaningful.

## Critical/High summary

None identified in this scoped review.

## Quick wins

Optional additional coverage: exercise the callable API/create with `expand: true`, parentheses-only and mixed 100/101 boundaries, and quoted/escaped/class-contained parentheses. Static inspection establishes their routing/handling; these omissions are not confirmed bypasses.

## Needs-a-decision items

None for this mitigation. The package retains version 3.0.3, so advisory scanners may still report the known advisory despite the local source patch; this review does not claim an upstream fixed release or scanner suppression.

## What was not checked

Did not independently run regression tests or frozen installation; the parent is performing those checks. Did not re-fetch advisory metadata, audit dependencies, review unrelated maintenance changes, scan secrets, review application boundaries, or assess general expansion/combinatorial resource limits. This depth guard targets recursion from supported string glob input, not arbitrary handcrafted ASTs or all possible resource-exhaustion classes.
