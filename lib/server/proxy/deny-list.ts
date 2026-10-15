import "server-only"

import type { DenyRule, ProxyMethod } from "./types"

/**
 * AD-2 denies, checked before the allowlist so a later allowlist mistake can
 * never open one of these. Exact METHOD + template, except `/**` (prefix).
 * Admin prefixes: `* v2/admin/**`; GraphQL: `* graphql/**` (spec 7.0a note).
 */
export const DENY_RULES: readonly DenyRule[] = [
  { method: "*", template: "auth/**" },
  { method: "*", template: "v2/public/external-application/**" },
  { method: "*", template: "v2/admin/**" },
  { method: "*", template: "graphql/**" },
  { method: "POST", template: "v2/mfa/enable" },
  { method: "POST", template: "v2/mfa/disable" },
  { method: "*", template: "v2/mfa/enable/<n>" },
  { method: "*", template: "v2/mfa/disable/<n>" },
  { method: "*", template: "v2/mfa/validate/<n>" },
  { method: "*", template: "v2/user/switch-tenant/**" },
  { method: "*", template: "v2/user/update-password" },
  { method: "*", template: "v2/tenant/sys-config" },
  /**
   * Spec F7-2 review: the backend's file delete checks only the tenant, so a
   * proxied delete could remove any file of the tenant. Deletes go only
   * through the named op `DELETE /api/pp/file/{fileId}` (ownership first).
   */
  { method: "DELETE", template: "v2/file/**" },
]

const NUMERIC_ID = /^\d{1,19}$/

function segmentMatches(pattern: string, segment: string): boolean {
  return pattern === "<n>" ? NUMERIC_ID.test(segment) : pattern === segment
}

function ruleMatches(rule: DenyRule, method: ProxyMethod, segments: readonly string[]): boolean {
  if (rule.method !== "*" && rule.method !== method) return false
  const parts = rule.template.split("/")
  if (parts[parts.length - 1] === "**") {
    const prefix = parts.slice(0, -1)
    return segments.length >= prefix.length && prefix.every((part, i) => segmentMatches(part, segments[i]))
  }
  return parts.length === segments.length && parts.every((part, i) => segmentMatches(part, segments[i]))
}

export function isDenied(
  method: ProxyMethod,
  segments: readonly string[],
  rules: readonly DenyRule[] = DENY_RULES,
): boolean {
  return rules.some((rule) => ruleMatches(rule, method, segments))
}
