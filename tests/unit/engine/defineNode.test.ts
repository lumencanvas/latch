import { describe, it, expect } from 'vitest'
import { defineNode } from '@/engine/defineNode'
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
  it('returns the spec unchanged (an identity brand)', () => {
    const executor = () => new Map<string, unknown>()
    const spec = defineNode({ definition: def, executor, pure: true, version: 2 })
    expect(spec.definition).toBe(def)
    expect(spec.executor).toBe(executor)
    expect(spec.pure).toBe(true)
    expect(spec.version).toBe(2)
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
