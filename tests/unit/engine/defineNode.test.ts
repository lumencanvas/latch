import { describe, it, expect, afterEach } from 'vitest'
import { defineNode, deriveModelDefinition, setModelSelectResolver } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'

const def: NodeDefinition = {
  id: 'x',
  name: 'X',
  version: '1.0.0',
  category: 'data',
  description: '',
  icon: 'box',
  platforms: ['web'],
  inputs: [],
  outputs: [],
  controls: [],
}

describe('defineNode', () => {
  it('returns the spec unchanged when it declares no models (identity brand)', () => {
    const executor = () => new Map<string, unknown>()
    const spec = defineNode({ definition: def, executor, pure: true, version: 2 })
    expect(spec.definition).toBe(def)
    expect(spec.executor).toBe(executor)
    expect(spec.pure).toBe(true)
    expect(spec.version).toBe(2)
  })

  it('carries optional declarative capability metadata (connections + models)', () => {
    const spec = defineNode({
      definition: def,
      executor: () => new Map(),
      connections: [{ protocol: 'mqtt', controlId: 'connectionId', required: true }],
      models: [{ task: 'object-detection', selectable: true }],
    })
    expect(spec.connections?.[0].protocol).toBe('mqtt')
    expect(spec.models?.[0].task).toBe('object-detection')
    expect(spec.models?.[0].selectable).toBe(true)
  })

  it('carries an optional migrate function', () => {
    const spec = defineNode({
      definition: def,
      executor: () => new Map(),
      version: 2,
      migrate: (data, from) => (from < 2 ? { ...data, migrated: true } : data),
    })
    expect(spec.migrate?.({ a: 1 }, 1)).toEqual({ a: 1, migrated: true })
  })
})

describe('defineNode model derivation (A2)', () => {
  const ids = (ports: { id: string }[]) => ports.map((p) => p.id)

  it('appends the loading/progress/done/error outputs, and defers the select with no resolver', () => {
    const spec = defineNode({
      definition: def,
      executor: () => new Map(),
      models: [{ task: 'object-detection' }],
    })
    expect(ids(spec.definition.outputs)).toEqual(['loading', 'progress', 'done', 'error'])
    // No global resolver injected in this context → the select is deferred (the registry re-derives it).
    expect(spec.definition.controls.find((c) => c.id === 'model')).toBeUndefined()
  })

  it('preserves the authored definition object identity when no models declared', () => {
    const spec = defineNode({ definition: def, executor: () => new Map() })
    expect(spec.definition).toBe(def) // strict no-op for the non-AI library
  })

  it('does not duplicate outputs the author already declares', () => {
    const withPorts: NodeDefinition = {
      ...def,
      outputs: [
        { id: 'result', type: 'data', label: 'Result' },
        { id: 'loading', type: 'boolean', label: 'Loading' },
        { id: 'done', type: 'trigger', label: 'Done' },
      ],
    }
    const spec = defineNode({
      definition: withPorts,
      executor: () => new Map(),
      models: [{ task: 'text-generation' }],
    })
    // existing loading/done kept in place; only the missing progress/error appended.
    expect(ids(spec.definition.outputs)).toEqual(['result', 'loading', 'done', 'progress', 'error'])
  })

  it('omits the model select when no task is selectable, or one already exists', () => {
    const notSelectable = defineNode({
      definition: def,
      executor: () => new Map(),
      models: [{ task: 'depth-estimation', selectable: false }],
    })
    expect(notSelectable.definition.controls.find((c) => c.id === 'model')).toBeUndefined()

    const authored: NodeDefinition = {
      ...def,
      controls: [{ id: 'model', type: 'select', label: 'Model', default: 'mine' }],
    }
    const kept = defineNode({
      definition: authored,
      executor: () => new Map(),
      models: [{ task: 'depth-estimation' }],
    })
    expect(kept.definition.controls.filter((c) => c.id === 'model')).toHaveLength(1)
    expect(kept.definition.controls[0].default).toBe('mine') // author's wins
  })

  it('is idempotent — deriving twice yields the same port/control shape', () => {
    const once = defineNode({
      definition: def,
      executor: () => new Map(),
      models: [{ task: 'sentiment-analysis' }],
    })
    const twice = defineNode({ ...once, definition: once.definition })
    expect(twice.definition.outputs).toEqual(once.definition.outputs)
    expect(twice.definition.controls).toEqual(once.definition.controls)
  })
})

describe('setModelSelectResolver — global injection into defineNode (E1)', () => {
  // The resolver is module-global; always clear it so one test can't leak into another.
  afterEach(() => setModelSelectResolver(undefined))

  it('populates a plain defineNode({ models }) select once a resolver is injected', () => {
    setModelSelectResolver((task) => ({
      options: [{ value: '', label: `Default (${task})` }, { value: 'x/y', label: 'Y' }],
      default: '',
    }))
    const spec = defineNode({ definition: def, executor: () => new Map(), models: [{ task: 'object-detection' }] })
    const model = spec.definition.controls.find((c) => c.id === 'model')
    expect(model?.props?.options).toEqual([
      { value: '', label: 'Default (object-detection)' },
      { value: 'x/y', label: 'Y' },
    ])
  })

  it('re-deriving a deferred spec after injection populates its select (the registry re-derive path)', () => {
    // A node whose defineNode() ran before the resolver was wired → select deferred...
    const deferred = defineNode({ definition: def, executor: () => new Map(), models: [{ task: 'object-detection' }] })
    expect(deferred.definition.controls.find((c) => c.id === 'model')).toBeUndefined()
    // ...then the resolver is injected and the registry re-runs defineNode on the spec (nodeRegistry).
    setModelSelectResolver((task) => ({
      options: [{ value: '', label: `Default (${task})` }, { value: 'a/b', label: 'B' }],
      default: '',
    }))
    const rederived = defineNode(deferred)
    expect(rederived.definition.controls.find((c) => c.id === 'model')?.props?.options).toEqual([
      { value: '', label: 'Default (object-detection)' },
      { value: 'a/b', label: 'B' },
    ])
    // outputs not duplicated on the second derive
    expect(rederived.definition.outputs.map((p) => p.id)).toEqual(['loading', 'progress', 'done', 'error'])
  })

  it('defers the select (adds no model control) when no resolver is injected', () => {
    setModelSelectResolver(undefined)
    const spec = defineNode({ definition: def, executor: () => new Map(), models: [{ task: 'object-detection' }] })
    expect(spec.definition.controls.find((c) => c.id === 'model')).toBeUndefined()
    // outputs are resolver-independent → still appended
    expect(spec.definition.outputs.map((p) => p.id)).toEqual(['loading', 'progress', 'done', 'error'])
  })
})

describe('deriveModelDefinition — injected catalog resolver', () => {
  it('populates the model select options + default from the resolver (first selectable task)', () => {
    const out = deriveModelDefinition(def, [{ task: 'text-generation' }], (task) => ({
      options: [
        { value: '', label: `Default (${task})` },
        { value: 'a/b', label: 'B' },
      ],
      default: '',
    }))
    const model = out.controls.find((c) => c.id === 'model')
    expect(model?.default).toBe('')
    expect(model?.props?.options).toEqual([
      { value: '', label: 'Default (text-generation)' },
      { value: 'a/b', label: 'B' },
    ])
  })

  it('defers the model select (adds no control) when no resolver is supplied', () => {
    const out = deriveModelDefinition(def, [{ task: 'text-generation' }])
    expect(out.controls.find((c) => c.id === 'model')).toBeUndefined()
    // outputs are resolver-independent, so they are still appended
    expect(out.outputs.map((p) => p.id)).toEqual(['loading', 'progress', 'done', 'error'])
  })

  it('does not consult the resolver when the model select is suppressed or already authored', () => {
    let called = false
    const resolver = () => {
      called = true
      return { options: [{ value: 'x', label: 'X' }], default: 'x' }
    }
    deriveModelDefinition(def, [{ task: 't', selectable: false }], resolver)
    const authored: NodeDefinition = {
      ...def,
      controls: [{ id: 'model', type: 'select', label: 'Model', default: 'mine' }],
    }
    deriveModelDefinition(authored, [{ task: 't' }], resolver)
    expect(called).toBe(false)
  })
})
