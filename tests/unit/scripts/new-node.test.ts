import { describe, it, expect } from 'vitest'
// The scaffold's templates are exported so their output shape is guarded here (the CLI dispatch is
// gated behind an `import.meta.url === argv[1]` check, so importing this has no side effects).
import { nodeTs, nodeTestTs, nodesTs, categoryTs, toPascal, toTitle, KEBAB } from '../../../scripts/new-node.mjs'

/**
 * A2 scaffold guard. `npm run new-node` / `new-category` must keep emitting nodes that match the
 * REAL authoring surface — if a convention drifts (an import path, the defineNode/defineNodes/
 * defineCategory brand, the ctx accessors, the testNode helper depth) the generated code would stop
 * compiling; this pins the template output so that never regresses silently.
 */

describe('scaffold string helpers', () => {
  it('derives Pascal/Title case from a kebab id', () => {
    expect(toPascal('my-cool-node')).toBe('MyCoolNode')
    expect(toTitle('my-cool-node')).toBe('My Cool Node')
  })
  it('KEBAB accepts kebab ids and rejects the rest', () => {
    expect(KEBAB.test('my-node')).toBe(true)
    expect(KEBAB.test('node')).toBe(true)
    expect(KEBAB.test('MyNode')).toBe(false)
    expect(KEBAB.test('my_node')).toBe(false)
    expect(KEBAB.test('-x')).toBe(false)
  })
})

describe('node.ts template', () => {
  const plain = nodeTs({ id: 'foo-bar', name: 'Foo Bar', category: 'math', component: false, stateful: false })

  it('emits a co-located defineNode with the id/name/category filled in', () => {
    expect(plain).toContain(`import { defineNode } from '@/engine/defineNode'`)
    expect(plain).toContain(`id: 'foo-bar'`)
    expect(plain).toContain(`name: 'Foo Bar'`)
    expect(plain).toContain(`category: 'math'`)
    expect(plain).toContain('export default defineNode({ definition, executor })')
    // uses the real typed accessor + ExecutionContext type
    expect(plain).toContain(`import type { ExecutionContext } from '@/engine/ExecutionEngine'`)
    expect(plain).toContain(`ctx.num('in')`)
    // plain node pulls in neither state nor a component
    expect(plain).not.toContain('defineNodeState')
    expect(plain).not.toContain('markRaw')
  })

  it('--stateful adds a defineNodeState store', () => {
    const s = nodeTs({ id: 'foo-bar', name: 'Foo Bar', category: 'math', component: false, stateful: true })
    expect(s).toContain(`import { defineNodeState } from '@/engine/nodeState'`)
    expect(s).toContain('defineNodeState<{ last: number }>')
    expect(s).toContain('.getOrCreate(ctx.nodeId')
  })

  it('--component wires markRaw + the co-located SFC', () => {
    const c = nodeTs({ id: 'foo-bar', name: 'Foo Bar', category: 'math', component: true, stateful: false })
    expect(c).toContain(`import FooBarNode from './FooBarNode.vue'`)
    expect(c).toContain('component: markRaw(FooBarNode)')
  })
})

describe('node.test.ts template', () => {
  const t = nodeTestTs({ id: 'foo-bar', name: 'Foo Bar', stateful: false })
  it('imports the node spec + the testNode helper at the correct co-located depth', () => {
    expect(t).toContain(`import spec from './node'`)
    // registry/<cat>/<id>/ is 5 levels under the repo root → 5 `../` to tests/helpers
    expect(t).toContain(`from '../../../../../tests/helpers/testNode'`)
    expect(t).toContain('runNode(spec')
  })
  it('a stateful test resets node state between cases', () => {
    const st = nodeTestTs({ id: 'foo-bar', name: 'Foo Bar', stateful: true })
    expect(st).toContain('resetNodeState')
    expect(st).toContain('beforeEach(resetNodeState)')
  })
})

describe('nodes.ts family template', () => {
  const fam = nodesTs({ category: 'data', ids: ['is-null', 'is-empty'] })
  it('registers a whole family via defineNodes([...])', () => {
    expect(fam).toContain(`import { defineNodes } from '@/engine/defineNode'`)
    expect(fam).toContain('export default defineNodes([')
    expect(fam).toContain(`id: 'is-null'`)
    expect(fam).toContain(`id: 'is-empty'`)
    expect(fam).toContain(`name: 'Is Null'`)
  })
})

describe('category.ts template', () => {
  const cat = categoryTs({ id: 'neon', label: 'Neon', icon: 'Sparkles', color: '#f0f' })
  it('emits a defineCategory with a lucide component icon', () => {
    expect(cat).toContain(`import { defineCategory } from '@/engine/defineCategory'`)
    expect(cat).toContain(`import { Sparkles } from 'lucide-vue-next'`)
    expect(cat).toContain(`id: 'neon'`)
    expect(cat).toContain(`label: 'Neon'`)
    expect(cat).toContain('icon: Sparkles')
    expect(cat).toContain(`color: '#f0f'`)
  })
})
