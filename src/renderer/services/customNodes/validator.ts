import type { NodeDefinition, PortDefinition, ControlDefinition, NodeCategory, DataType, Platform } from '@/stores/nodes'
import type { NodeConnectionRequirement } from '@/services/connections/types'
import type { NodeRequirement } from '@/utils/platform'

// Valid values for validation
const VALID_REQUIREMENTS: NodeRequirement[] = ['serial', 'midi', 'bluetooth', 'webgpu', 'camera']

const VALID_CATEGORIES: NodeCategory[] = [
  'debug', 'inputs', 'outputs', 'math', 'logic', 'audio', 'video',
  'visual', 'shaders', 'data', 'ai', 'code', '3d', 'connectivity', 'subflows', 'custom'
]

const VALID_DATA_TYPES: DataType[] = [
  'trigger', 'number', 'string', 'boolean', 'audio', 'video', 'texture', 'data', 'array', 'any'
]

const VALID_PLATFORMS: Platform[] = ['web', 'electron']

const VALID_CONTROL_TYPES = ['number', 'text', 'toggle', 'slider', 'select', 'code', 'color']

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public value?: unknown
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

function validateString(value: unknown, field: string, minLength = 1): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`, field, value)
  }
  if (value.length < minLength) {
    throw new ValidationError(`${field} must be at least ${minLength} character(s)`, field, value)
  }
  return value
}

function validateArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array`, field, value)
  }
  return value as T[]
}

function validatePort(port: unknown, index: number, portType: 'input' | 'output'): PortDefinition {
  if (typeof port !== 'object' || port === null) {
    throw new ValidationError(`${portType}s[${index}] must be an object`, `${portType}s[${index}]`, port)
  }

  const p = port as Record<string, unknown>

  const id = validateString(p.id, `${portType}s[${index}].id`)
  const label = validateString(p.label, `${portType}s[${index}].label`)
  const type = validateString(p.type, `${portType}s[${index}].type`) as DataType

  if (!VALID_DATA_TYPES.includes(type)) {
    throw new ValidationError(
      `${portType}s[${index}].type must be one of: ${VALID_DATA_TYPES.join(', ')}`,
      `${portType}s[${index}].type`,
      type
    )
  }

  const result: PortDefinition = { id, type, label }

  if (p.description !== undefined) {
    result.description = validateString(p.description, `${portType}s[${index}].description`, 0)
  }
  if (p.required !== undefined) {
    result.required = Boolean(p.required)
  }
  if (p.multiple !== undefined) {
    result.multiple = Boolean(p.multiple)
  }
  if (p.default !== undefined) {
    result.default = p.default
  }

  return result
}

function validateControl(control: unknown, index: number): ControlDefinition {
  if (typeof control !== 'object' || control === null) {
    throw new ValidationError(`controls[${index}] must be an object`, `controls[${index}]`, control)
  }

  const c = control as Record<string, unknown>

  const id = validateString(c.id, `controls[${index}].id`)
  const label = validateString(c.label, `controls[${index}].label`)
  const type = validateString(c.type, `controls[${index}].type`)

  if (!VALID_CONTROL_TYPES.includes(type)) {
    throw new ValidationError(
      `controls[${index}].type must be one of: ${VALID_CONTROL_TYPES.join(', ')}`,
      `controls[${index}].type`,
      type
    )
  }

  const result: ControlDefinition = { id, type, label }

  if (c.description !== undefined) {
    result.description = validateString(c.description, `controls[${index}].description`, 0)
  }
  if (c.default !== undefined) {
    result.default = c.default
  }
  if (c.exposable !== undefined) {
    result.exposable = Boolean(c.exposable)
  }
  if (c.bindable !== undefined) {
    result.bindable = Boolean(c.bindable)
  }
  if (c.props !== undefined) {
    if (typeof c.props !== 'object' || c.props === null) {
      throw new ValidationError(`controls[${index}].props must be an object`, `controls[${index}].props`, c.props)
    }
    result.props = c.props as Record<string, unknown>
  }

  return result
}

export function validateDefinition(definition: unknown): NodeDefinition {
  if (typeof definition !== 'object' || definition === null) {
    throw new ValidationError('Definition must be an object')
  }

  const def = definition as Record<string, unknown>

  // Required string fields
  const id = validateString(def.id, 'id')
  const name = validateString(def.name, 'name')
  const version = validateString(def.version, 'version')
  const description = validateString(def.description, 'description', 0)
  const icon = validateString(def.icon, 'icon')

  // Validate category
  const category = validateString(def.category, 'category') as NodeCategory
  if (!VALID_CATEGORIES.includes(category)) {
    throw new ValidationError(
      `category must be one of: ${VALID_CATEGORIES.join(', ')}`,
      'category',
      category
    )
  }

  // Validate platforms
  const platformsRaw = validateArray<unknown>(def.platforms, 'platforms')
  if (platformsRaw.length === 0) {
    throw new ValidationError('platforms must contain at least one platform', 'platforms', platformsRaw)
  }
  const platforms: Platform[] = platformsRaw.map((p, i) => {
    const platform = validateString(p, `platforms[${i}]`) as Platform
    if (!VALID_PLATFORMS.includes(platform)) {
      throw new ValidationError(
        `platforms[${i}] must be one of: ${VALID_PLATFORMS.join(', ')}`,
        `platforms[${i}]`,
        platform
      )
    }
    return platform
  })

  // Validate inputs
  const inputsRaw = validateArray<unknown>(def.inputs, 'inputs')
  const inputs = inputsRaw.map((port, i) => validatePort(port, i, 'input'))

  // Validate outputs
  const outputsRaw = validateArray<unknown>(def.outputs, 'outputs')
  const outputs = outputsRaw.map((port, i) => validatePort(port, i, 'output'))

  // Validate controls
  const controlsRaw = validateArray<unknown>(def.controls, 'controls')
  const controls = controlsRaw.map((control, i) => validateControl(control, i))

  // Check for duplicate IDs
  const inputIds = new Set(inputs.map(p => p.id))
  if (inputIds.size !== inputs.length) {
    throw new ValidationError('Duplicate input port IDs found', 'inputs')
  }

  const outputIds = new Set(outputs.map(p => p.id))
  if (outputIds.size !== outputs.length) {
    throw new ValidationError('Duplicate output port IDs found', 'outputs')
  }

  const controlIds = new Set(controls.map(c => c.id))
  if (controlIds.size !== controls.length) {
    throw new ValidationError('Duplicate control IDs found', 'controls')
  }

  // Build result
  const result: NodeDefinition = {
    id,
    name,
    version,
    category,
    description,
    icon,
    platforms,
    inputs,
    outputs,
    controls,
  }

  // Optional fields
  if (def.color !== undefined) {
    result.color = validateString(def.color, 'color')
  }
  if (def.webFallback !== undefined) {
    result.webFallback = validateString(def.webFallback, 'webFallback')
  }
  if (def.tags !== undefined) {
    const tagsRaw = validateArray<unknown>(def.tags, 'tags')
    result.tags = tagsRaw.map((t, i) => validateString(t, `tags[${i}]`))
  }

  // Validate optional info field
  if (def.info !== undefined) {
    if (typeof def.info !== 'object' || def.info === null) {
      throw new ValidationError('info must be an object', 'info', def.info)
    }
    const info = def.info as Record<string, unknown>
    const overview = validateString(info.overview, 'info.overview')
    const nodeInfo: { overview: string; tips?: string[]; pairsWith?: string[] } = { overview }

    if (info.tips !== undefined) {
      const tipsRaw = validateArray<unknown>(info.tips, 'info.tips')
      nodeInfo.tips = tipsRaw.map((t, i) => validateString(t, `info.tips[${i}]`))
    }
    if (info.pairsWith !== undefined) {
      const pairsRaw = validateArray<unknown>(info.pairsWith, 'info.pairsWith')
      nodeInfo.pairsWith = pairsRaw.map((p, i) => validateString(p, `info.pairsWith[${i}]`))
    }

    result.info = nodeInfo
  }

  // Declared capabilities (SECURITY_MODEL) — these DRIVE the capability gate + disclosure,
  // so they must survive validation. `trust` is deliberately NOT copied: it is assigned by
  // origin at load, never author-declared (a community node must not be able to claim `core`).
  if (def.connections !== undefined) {
    const raw = validateArray<unknown>(def.connections, 'connections')
    result.connections = raw.map((c, i): NodeConnectionRequirement => {
      if (typeof c !== 'object' || c === null) {
        throw new ValidationError(`connections[${i}] must be an object`, `connections[${i}]`, c)
      }
      const entry = c as Record<string, unknown>
      const conn: NodeConnectionRequirement = {
        protocol: validateString(entry.protocol, `connections[${i}].protocol`),
        controlId: validateString(entry.controlId, `connections[${i}].controlId`),
      }
      if (entry.required !== undefined) {
        if (typeof entry.required !== 'boolean') {
          throw new ValidationError(
            `connections[${i}].required must be a boolean`,
            `connections[${i}].required`,
            entry.required
          )
        }
        conn.required = entry.required
      }
      return conn
    })
  }
  if (def.requires !== undefined) {
    const raw = validateArray<unknown>(def.requires, 'requires')
    result.requires = raw.map((r, i): NodeRequirement => {
      const s = validateString(r, `requires[${i}]`)
      if (!VALID_REQUIREMENTS.includes(s as NodeRequirement)) {
        throw new ValidationError(
          `requires[${i}] must be one of: ${VALID_REQUIREMENTS.join(', ')}`,
          `requires[${i}]`,
          r
        )
      }
      return s as NodeRequirement
    })
  }

  return result
}
