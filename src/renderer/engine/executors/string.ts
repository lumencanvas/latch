/**
 * String Node Executors
 *
 * These executors handle string manipulation operations
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'

// ============================================================================
// String Concat
// ============================================================================

export const stringConcatExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as string) ?? ''
  const b = (ctx.inputs.get('b') as string) ?? ''
  const c = (ctx.inputs.get('c') as string) ?? ''
  const d = (ctx.inputs.get('d') as string) ?? ''
  const separator = (ctx.controls.get('separator') as string) ?? ''

  // Filter out empty strings before joining
  const parts = [a, b, c, d].filter((s) => s !== '')
  const result = parts.join(separator)

  return new Map([['result', result]])
}

// ============================================================================
// String Split
// ============================================================================

export const stringSplitExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''
  const separator = (ctx.controls.get('separator') as string) ?? ','
  const limit = (ctx.controls.get('limit') as number) ?? 0

  const outputs = new Map<string, unknown>()

  if (!input) {
    outputs.set('parts', [])
    outputs.set('first', '')
    outputs.set('count', 0)
    return outputs
  }

  // Handle empty separator - return whole string as single element instead of splitting into characters
  if (separator === '') {
    outputs.set('parts', [input])
    outputs.set('first', input)
    outputs.set('count', 1)
    return outputs
  }

  const parts = limit > 0 ? input.split(separator, limit) : input.split(separator)

  outputs.set('parts', parts)
  outputs.set('first', parts[0] ?? '')
  outputs.set('count', parts.length)

  return outputs
}

// ============================================================================
// String Replace
// ============================================================================

export const stringReplaceExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''

  // Use nullish coalescing to properly handle empty string inputs
  // If search input is connected (even as empty string), use it; otherwise fall back to control
  const searchInput = ctx.inputs.get('search')
  const replaceInput = ctx.inputs.get('replace')

  const search = searchInput !== undefined
    ? (searchInput as string)
    : ((ctx.controls.get('search') as string) ?? '')
  const replace = replaceInput !== undefined
    ? (replaceInput as string)
    : ((ctx.controls.get('replace') as string) ?? '')
  const useRegex = (ctx.controls.get('useRegex') as boolean) ?? false
  const replaceAll = (ctx.controls.get('replaceAll') as boolean) ?? true

  const outputs = new Map<string, unknown>()

  if (!input || !search) {
    outputs.set('result', input)
    return outputs
  }

  let result: string
  try {
    if (useRegex) {
      const flags = replaceAll ? 'g' : ''
      const regex = new RegExp(search, flags)
      result = input.replace(regex, replace)
    } else {
      if (replaceAll) {
        result = input.split(search).join(replace)
      } else {
        result = input.replace(search, replace)
      }
    }
  } catch {
    // Invalid regex
    result = input
    outputs.set('_error', 'Invalid regex pattern')
  }

  outputs.set('result', result)
  return outputs
}

// ============================================================================
// String Slice
// ============================================================================

export const stringSliceExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''
  const startInput = ctx.inputs.get('start') as number | undefined
  const endInput = ctx.inputs.get('end') as number | undefined

  const start = startInput ?? (ctx.controls.get('start') as number) ?? 0
  const endControl = (ctx.controls.get('end') as number) ?? -1
  const end = endInput ?? endControl

  const outputs = new Map<string, unknown>()

  if (!input) {
    outputs.set('result', '')
    outputs.set('length', 0)
    return outputs
  }

  // Handle -1 as "end of string"
  const result = end === -1 ? input.slice(start) : input.slice(start, end)

  outputs.set('result', result)
  outputs.set('length', result.length)

  return outputs
}

// ============================================================================
// String Case
// ============================================================================

function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
}

function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
}

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase())
}

export const stringCaseExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''
  const mode = (ctx.controls.get('mode') as string) ?? 'UPPER'

  let result: string

  switch (mode) {
    case 'UPPER':
      result = input.toUpperCase()
      break
    case 'lower':
      result = input.toLowerCase()
      break
    case 'Title':
      result = toTitleCase(input)
      break
    case 'camelCase':
      result = toCamelCase(input)
      break
    case 'snake_case':
      result = toSnakeCase(input)
      break
    case 'kebab-case':
      result = toKebabCase(input)
      break
    default:
      result = input
  }

  return new Map([['result', result]])
}

// ============================================================================
// Registry
// ============================================================================

export const stringExecutors: Record<string, NodeExecutorFn> = {
  'string-concat': stringConcatExecutor,
  'string-split': stringSplitExecutor,
  'string-replace': stringReplaceExecutor,
  'string-slice': stringSliceExecutor,
  'string-case': stringCaseExecutor,
}
