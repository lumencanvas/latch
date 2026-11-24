/**
 * Path helpers for the object-* data nodes (get / has / set). Extracted verbatim from the
 * legacy engine/executors/data.ts during Phase-6 co-location, so object-get / object-has /
 * object-set can each stay a self-contained registry/data/<node>/node.ts that imports these.
 */

/** Path segments that must never be walked or written (prototype-pollution guard). */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

/**
 * Get nested property from object using dot notation path
 * Supports array indexing with brackets: "data.items[0].name"
 */
export function getByPath(obj: unknown, path: string): { value: unknown; found: boolean } {
  if (!path || obj === null || obj === undefined) {
    return { value: undefined, found: false }
  }

  // Convert bracket notation to dot notation: "items[0]" -> "items.0"
  const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1')
  const parts = normalizedPath.split('.')

  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) {
      return { value: undefined, found: false }
    }
    if (typeof current !== 'object') {
      return { value: undefined, found: false }
    }
    // OWN properties only: walking the prototype chain made inherited members "present"
    // (`{}` + path "constructor" → the Object function, found = true; "toString" likewise).
    // Arrays additionally expose `length`.
    if (!hasOwn(current, part) && !(Array.isArray(current) && part === 'length')) {
      return { value: undefined, found: false }
    }
    current = (current as Record<string, unknown>)[part]
  }

  return { value: current, found: current !== undefined }
}

/**
 * Set nested property on object using dot notation path
 * Returns a new object (immutable)
 */
export function setByPath(obj: unknown, path: string, value: unknown): unknown {
  if (!path) return obj

  // Convert bracket notation to dot notation
  const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1')
  const parts = normalizedPath.split('.')

  // Prototype-pollution guard: a __proto__ / constructor / prototype segment must never be walked
  // or assigned — it would corrupt the prototype chain instead of setting a data property. Reject
  // such paths, returning the object unchanged.
  if (parts.some((p) => FORBIDDEN_KEYS.has(p))) return obj

  const result = Array.isArray(obj) ? [...obj] : { ...(obj as object) }
  let current: unknown = result

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    const nextPart = parts[i + 1]
    const isNextArray = /^\d+$/.test(nextPart)

    const currentObj = current as Record<string, unknown>
    if (currentObj[part] === undefined) {
      currentObj[part] = isNextArray ? [] : {}
    } else {
      const existingVal = currentObj[part]
      currentObj[part] = Array.isArray(existingVal) ? [...existingVal] : { ...(existingVal as object) }
    }
    current = currentObj[part]
  }

  (current as Record<string, unknown>)[parts[parts.length - 1]] = value
  return result
}
