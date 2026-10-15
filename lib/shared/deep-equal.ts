/**
 * Structural equality for plain form data (Story 1.11: a Section is dirty
 * when its values deep-differ from the baseline, not when it was touched).
 * Handles primitives (`NaN` equals `NaN`), arrays, `Date` and plain objects
 * (a key whose value is `undefined` counts as absent, as in form values);
 * anything else is compared by identity.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false
  const keysA = definedKeys(a)
  const keysB = definedKeys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => b[key] !== undefined && deepEqual(a[key], b[key]))
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function definedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => value[key] !== undefined)
}
