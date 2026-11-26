import type { JSONSchema } from './types'

/**
 * Validate `value` against the JSON-Schema subset in {@link JSONSchema}. Returns the first
 * problem as a path-qualified message ("controls.frequency: expected number ≤ 20000") so an
 * agent can correct itself, or null when the value is valid. Objects default to rejecting
 * unknown properties unless `additionalProperties: true`.
 */
export function validateSchema(schema: JSONSchema, value: unknown, path = 'input'): string | null {
  if (schema.enum && !schema.enum.some((e) => e === value)) {
    return `${path}: expected one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`
  }
  switch (schema.type) {
    case undefined:
      return null
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return `${path}: expected an object`
      const obj = value as Record<string, unknown>
      for (const key of schema.required ?? []) {
        if (obj[key] === undefined) return `${path}.${key}: required`
      }
      const props = schema.properties ?? {}
      for (const [key, v] of Object.entries(obj)) {
        const sub = Object.prototype.hasOwnProperty.call(props, key) ? props[key] : undefined
        if (!sub) {
          if (schema.additionalProperties === true) continue
          const known = Object.keys(props)
          return `${path}.${key}: unknown property${known.length ? ` (expected ${known.join(', ')})` : ''}`
        }
        if (v === undefined) continue
        const err = validateSchema(sub, v, `${path}.${key}`)
        if (err) return err
      }
      if (schema.maxItems !== undefined && Object.keys(obj).length > schema.maxItems) {
        return `${path}: at most ${schema.maxItems} entries`
      }
      return null
    }
    case 'array': {
      if (!Array.isArray(value)) return `${path}: expected an array`
      if (schema.minItems !== undefined && value.length < schema.minItems) return `${path}: at least ${schema.minItems} items`
      if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${path}: at most ${schema.maxItems} items`
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const err = validateSchema(schema.items, value[i], `${path}[${i}]`)
          if (err) return err
        }
      }
      return null
    }
    case 'string': {
      if (typeof value !== 'string') return `${path}: expected a string`
      if (schema.minLength !== undefined && value.length < schema.minLength) return `${path}: at least ${schema.minLength} characters`
      if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${path}: at most ${schema.maxLength} characters`
      return null
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${path}: expected a number`
      if (schema.type === 'integer' && !Number.isInteger(value)) return `${path}: expected an integer`
      if (schema.minimum !== undefined && value < schema.minimum) return `${path}: expected a number ≥ ${schema.minimum}`
      if (schema.maximum !== undefined && value > schema.maximum) return `${path}: expected a number ≤ ${schema.maximum}`
      return null
    }
    case 'boolean':
      return typeof value === 'boolean' ? null : `${path}: expected true or false`
  }
}
