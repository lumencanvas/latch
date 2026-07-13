import type {
  NodeDefinition, PortDefinition, ControlDefinition, NodeCategory, DataType, Platform,
  UISchema, UIRow, UIWidget, WidgetType, Surface, WhenSchema,
} from '@/stores/nodes'
import type { NodeConnectionRequirement } from '@/services/connections/types'
import type { NodeRequirement } from '@/utils/platform'
import type { ModelRequirement } from '@/services/ai/defineModel'

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

// ── Declarative `ui` schema validation (Phase 3 bullet 2) ─────────────────────────────────────
// Custom (untrusted) nodes may use only TIER-A widgets, whose values are simple 2-way binds or a
// read-only readout — no aggregate adapters, no event widgets, and NEVER a code component. This is
// what lets `ui` cross the trust boundary safely: every widget maps to a built-in, validated here.
const CUSTOM_UI_WIDGETS = new Set<WidgetType>([
  'slider', 'number', 'toggle', 'select', 'text', 'color', // primitives
  'knob', 'asset', 'connection', 'readout',                // tier A
])

// Prop keys allowed per widget type; values must be primitive or primitive[] (see below).
const WIDGET_PROPS: Partial<Record<WidgetType, string[]>> = {
  slider: ['min', 'max', 'step'],
  number: ['min', 'max', 'step'],
  text: ['placeholder'],
  knob: ['min', 'max', 'step', 'accentColor', 'size', 'default'],
  asset: ['assetType'],
  connection: ['protocol', 'placeholder'],
}

const WHEN_OPERATORS = ['in', 'ne', 'gt', 'lt']

// Reserved keys an untrusted `ui` may never use (they alias the prototype chain). `bind`/`prop`
// keys are already guarded (Set membership / per-type allowlist); `when` keys are arbitrary control
// ids, so they get this explicit check.
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function validatePropValue(v: unknown, field: string): string | number | boolean | Array<string | number> {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number')) {
    return v as Array<string | number>
  }
  throw new ValidationError(`${field} must be a primitive or array of string|number`, field, v)
}

function validateWhenClause(when: unknown, field: string): WhenSchema {
  if (typeof when !== 'object' || when === null || Array.isArray(when)) {
    throw new ValidationError(`${field} must be an object`, field, when)
  }
  const out: Record<string, unknown> = {}
  for (const [k, cond] of Object.entries(when as Record<string, unknown>)) {
    if (RESERVED_KEYS.has(k)) {
      throw new ValidationError(`${field}.${k} is a reserved key`, `${field}.${k}`, k)
    }
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
      const keys = Object.keys(cond as object)
      if (keys.length !== 1 || !WHEN_OPERATORS.includes(keys[0])) {
        throw new ValidationError(`${field}.${k} must be a value or one operator of ${WHEN_OPERATORS.join('/')}`, `${field}.${k}`, cond)
      }
      const op = keys[0]
      const val = (cond as Record<string, unknown>)[op]
      if (op === 'in' && !Array.isArray(val)) {
        throw new ValidationError(`${field}.${k}.in must be an array`, `${field}.${k}.in`, val)
      }
      if ((op === 'gt' || op === 'lt') && typeof val !== 'number') {
        throw new ValidationError(`${field}.${k}.${op} must be a number`, `${field}.${k}.${op}`, val)
      }
    } else if (typeof cond === 'function' || (typeof cond === 'object' && cond !== null)) {
      throw new ValidationError(`${field}.${k} must be a primitive`, `${field}.${k}`, cond)
    }
    out[k] = cond
  }
  return out as WhenSchema
}

function validateWidget(wid: unknown, field: string, controlIds: Set<string>, outputIds: Set<string>): UIWidget {
  if (typeof wid !== 'object' || wid === null) {
    throw new ValidationError(`${field} must be an object`, field, wid)
  }
  const w = wid as Record<string, unknown>
  const type = validateString(w.type, `${field}.type`) as WidgetType
  if (!CUSTOM_UI_WIDGETS.has(type)) {
    throw new ValidationError(`${field}.type '${type}' is not allowed for custom nodes`, `${field}.type`, type)
  }
  const bind = validateString(w.bind, `${field}.bind`)
  let source: 'control' | 'output' | undefined
  if (w.source !== undefined) {
    const s = validateString(w.source, `${field}.source`)
    if (s !== 'control' && s !== 'output') {
      throw new ValidationError(`${field}.source must be 'control' or 'output'`, `${field}.source`, s)
    }
    source = s
  }
  const ids = source === 'output' ? outputIds : controlIds
  if (!ids.has(bind)) {
    throw new ValidationError(`${field}.bind '${bind}' does not resolve to a declared ${source === 'output' ? 'output' : 'control'}`, `${field}.bind`, bind)
  }
  const out: UIWidget = { type, bind }
  if (source) out.source = source
  if (w.label !== undefined) out.label = validateString(w.label, `${field}.label`)
  if (w.when !== undefined) out.when = validateWhenClause(w.when, `${field}.when`)
  if (w.props !== undefined) {
    if (typeof w.props !== 'object' || w.props === null || Array.isArray(w.props)) {
      throw new ValidationError(`${field}.props must be an object`, `${field}.props`, w.props)
    }
    const allowed = WIDGET_PROPS[type] ?? []
    const props: Record<string, string | number | boolean | Array<string | number>> = {}
    for (const [k, v] of Object.entries(w.props)) {
      if (!allowed.includes(k)) {
        throw new ValidationError(`${field}.props.${k} is not allowed for widget '${type}'`, `${field}.props.${k}`, k)
      }
      props[k] = validatePropValue(v, `${field}.props.${k}`)
    }
    if (Object.keys(props).length > 0) out.props = props
  }
  return out
}

/**
 * Validate + sanitize a custom node's declarative `ui` schema. Widget types are restricted to the
 * Tier-A closed set, every `bind` must resolve to a declared control (or output for readouts), and
 * `props`/`when` are whitelisted to primitives — so a custom node's UI can never smuggle code or an
 * unresolved reference across the trust boundary.
 */
export function validateUISchema(ui: unknown, controlIds: Set<string>, outputIds: Set<string>): UISchema {
  if (typeof ui !== 'object' || ui === null || Array.isArray(ui)) {
    throw new ValidationError('ui must be an object', 'ui', ui)
  }
  const u = ui as Record<string, unknown>
  const rowsRaw = validateArray<unknown>(u.rows, 'ui.rows')
  const rows: UIRow[] = rowsRaw.map((row, ri) => {
    if (typeof row !== 'object' || row === null) {
      throw new ValidationError(`ui.rows[${ri}] must be an object`, `ui.rows[${ri}]`, row)
    }
    const r = row as Record<string, unknown>
    const outRow: UIRow = { widgets: [] }
    if (r.label !== undefined) outRow.label = validateString(r.label, `ui.rows[${ri}].label`)
    if (r.when !== undefined) outRow.when = validateWhenClause(r.when, `ui.rows[${ri}].when`)
    const widgetsRaw = validateArray<unknown>(r.widgets, `ui.rows[${ri}].widgets`)
    outRow.widgets = widgetsRaw.map((wid, wi) => validateWidget(wid, `ui.rows[${ri}].widgets[${wi}]`, controlIds, outputIds))
    return outRow
  })
  const result: UISchema = { rows }
  if (u.surfaces !== undefined) {
    const s = validateArray<unknown>(u.surfaces, 'ui.surfaces')
    result.surfaces = s.map((x, i): Surface => {
      const v = validateString(x, `ui.surfaces[${i}]`)
      if (v !== 'node' && v !== 'panel') {
        throw new ValidationError(`ui.surfaces[${i}] must be 'node' or 'panel'`, `ui.surfaces[${i}]`, v)
      }
      return v
    })
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

  // Declarative `ui` (Phase 3 bullet 2) — sanitized to Tier-A widgets with resolvable binds.
  // `component` is deliberately NOT copied: a custom node can never supply a code component.
  if (def.ui !== undefined) {
    result.ui = validateUISchema(def.ui, controlIds, outputIds)
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

/** The `defineNode`-level fields a custom node may declare alongside its `NodeDefinition`. */
export interface NodeSpecExtras {
  pure?: boolean
  deferred?: boolean
  models?: ModelRequirement[]
}

/**
 * Validate the optional `defineNode` NodeSpec-level fields a custom node may declare next to its
 * definition — so a user node flows through the SAME `defineNode` assembly as a built-in and can
 * tap the declarative `models:` subsystem (a populated model select + standardized loading/progress/
 * done/error outputs) and the `pure`/`deferred` execution hints.
 *
 * Security-neutral by construction: these fields drive derivation/optimization only. It does NOT
 * touch the trust boundary — `component` is still never accepted (only `validateDefinition` builds the
 * definition, and it strips it), the trust tier is still origin-assigned, and a custom `ui` is still
 * Tier-A-only. `models` cannot name a `component` or code; it is a task string plus a boolean.
 */
export function validateSpecExtras(definition: unknown): NodeSpecExtras {
  if (typeof definition !== 'object' || definition === null) return {}
  const def = definition as Record<string, unknown>
  const out: NodeSpecExtras = {}

  if (def.pure !== undefined) out.pure = Boolean(def.pure)
  if (def.deferred !== undefined) out.deferred = Boolean(def.deferred)

  if (def.models !== undefined) {
    const raw = validateArray<unknown>(def.models, 'models')
    out.models = raw.map((m, i): ModelRequirement => {
      if (typeof m !== 'object' || m === null) {
        throw new ValidationError(`models[${i}] must be an object`, `models[${i}]`, m)
      }
      const entry = m as Record<string, unknown>
      const req: ModelRequirement = { task: validateString(entry.task, `models[${i}].task`) }
      if (entry.selectable !== undefined) {
        if (typeof entry.selectable !== 'boolean') {
          throw new ValidationError(`models[${i}].selectable must be a boolean`, `models[${i}].selectable`, entry.selectable)
        }
        req.selectable = entry.selectable
      }
      return req
    })
  }

  return out
}
