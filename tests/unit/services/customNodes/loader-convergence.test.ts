import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore } from '@/stores/nodes'
import { getExecutionEngine } from '@/engine/ExecutionEngine'
import { getCustomNodeLoader } from '@/services/customNodes/CustomNodeLoader'
import { validateSpecExtras, ValidationError } from '@/services/customNodes/validator'

/**
 * Workstream C (safe slice): a custom (user) node now flows through the SAME `defineNode` assembly
 * as a built-in, so it can declare the optional NodeSpec-level fields (`models`, `pure`, `deferred`)
 * and tap the declarative `models:` subsystem — while the trust boundary is unchanged (trust stamped
 * by origin, `component` still stripped, custom `ui` still Tier-A).
 */

// A minimal, valid custom-node definition (all required NodeDefinition fields).
function baseDef(extra: Record<string, unknown> = {}) {
  return {
    id: 'user-thing',
    name: 'User Thing',
    version: '1.0.0',
    category: 'custom',
    description: 'a user node',
    icon: 'box',
    platforms: ['web'],
    inputs: [{ id: 'in', type: 'number', label: 'In' }],
    outputs: [{ id: 'out', type: 'number', label: 'Out' }],
    controls: [],
    ...extra,
  }
}
const CODE = 'export default (ctx) => new Map([["out", 42]])'

describe('validateSpecExtras', () => {
  it('returns empty for a definition with no spec-level fields', () => {
    expect(validateSpecExtras(baseDef())).toEqual({})
  })

  it('coerces pure/deferred to booleans and validates models', () => {
    const extras = validateSpecExtras(baseDef({ pure: true, deferred: 1, models: [{ task: 'object-detection' }] }))
    expect(extras.pure).toBe(true)
    expect(extras.deferred).toBe(true)
    expect(extras.models).toEqual([{ task: 'object-detection' }])
  })

  it('accepts a models entry with selectable and rejects a malformed one', () => {
    expect(validateSpecExtras(baseDef({ models: [{ task: 't', selectable: false }] })).models)
      .toEqual([{ task: 't', selectable: false }])
    expect(() => validateSpecExtras(baseDef({ models: [{}] }))).toThrow(ValidationError)
    expect(() => validateSpecExtras(baseDef({ models: 'nope' }))).toThrow(ValidationError)
    expect(() => validateSpecExtras(baseDef({ models: [{ task: 't', selectable: 'yes' }] }))).toThrow(ValidationError)
  })
})

describe('CustomNodeLoader convergence on defineNode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('routes a models-declaring custom node through defineNode → derived standardized outputs', () => {
    const loader = getCustomNodeLoader()
    loader.loadFromCode(JSON.stringify(baseDef({ models: [{ task: 'object-detection' }] })), CODE)

    const def = useNodesStore().getDefinition('user-thing')
    expect(def).toBeTruthy()
    const outIds = def!.outputs.map((p) => p.id)
    // the declared output plus the model-derived standardized outputs
    expect(outIds).toContain('out')
    expect(outIds).toEqual(expect.arrayContaining(['loading', 'progress', 'done', 'error']))
    // trust is stamped by origin (web import → community), never from author input
    expect(def!.trust).toBe('community')
  })

  it('leaves a plain custom node (no spec extras) behaviorally unchanged', () => {
    const loader = getCustomNodeLoader()
    loader.loadFromCode(JSON.stringify(baseDef()), CODE)

    const def = useNodesStore().getDefinition('user-thing')
    expect(def!.outputs.map((p) => p.id)).toEqual(['out']) // no derived outputs appended
    expect(def!.trust).toBe('community')
  })

  it('threads pure/deferred hints into engine.registerExecutor (the load-bearing wiring)', () => {
    const spy = vi.spyOn(getExecutionEngine(), 'registerExecutor')
    const loader = getCustomNodeLoader()

    loader.loadFromCode(JSON.stringify(baseDef({ pure: true, deferred: true })), CODE)
    expect(spy).toHaveBeenLastCalledWith('user-thing', expect.any(Function), { pure: true, deferred: true })

    // a plain node opts into neither (falsy → the engine clears any prior opt-in)
    loader.loadFromCode(JSON.stringify(baseDef()), CODE)
    expect(spy).toHaveBeenLastCalledWith('user-thing', expect.any(Function), { pure: undefined, deferred: undefined })

    spy.mockRestore()
  })
})
