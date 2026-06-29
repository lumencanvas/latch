import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
// Import the store/registry chain BEFORE BaseNode.vue. `registry/components.ts`
// does `markRaw(BaseNode)` at module scope; if BaseNode.vue is the cycle entry
// point it is still mid-evaluation there → `markRaw(undefined)` crash. Loading a
// store first fully resolves BaseNode via components.ts before we import it here.
import { useNodesStore, type NodeDefinition } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'
import BaseNode from '@/components/nodes/BaseNode.vue'

/**
 * First @vue/test-utils component test in the repo. Guards the Phase-0 fix that
 * binds :min/:max on number controls (127 controls silently dropped them) and
 * clamps to the declared range on blur without hard-clamping per keystroke.
 */

function defWithNumberControls(): NodeDefinition {
  return {
    id: 'test-number',
    name: 'Test Number',
    version: '1.0.0',
    // 'data' is NOT a compact category, so inline controls render in the body.
    category: 'data',
    description: '',
    icon: 'box',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [],
    controls: [
      { id: 'bounded', type: 'number', label: 'Bounded', default: 5, props: { min: 0, max: 10 } },
      { id: 'free', type: 'number', label: 'Free', default: 0 },
    ],
  }
}

function mountNode() {
  const nodesStore = useNodesStore()
  nodesStore.register(defWithNumberControls())

  return mount(BaseNode as unknown as Record<string, unknown>, {
    props: {
      id: 'node-1',
      type: 'test-number',
      data: { nodeType: 'test-number', bounded: 5, free: 0 },
      // The rest are required by Vue Flow's NodeProps; BaseNode doesn't read
      // them, but supplying them keeps the test output free of prop warnings.
      selected: false,
      connectable: true,
      position: { x: 0, y: 0 },
      dimensions: { width: 100, height: 50 },
      dragging: false,
      resizing: false,
      zIndex: 0,
      events: {},
    },
    global: {
      stubs: {
        Handle: true,
        NodeConnectionStatus: true,
      },
    },
  })
}

describe('BaseNode number controls', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('binds :min/:max from control.props', () => {
    const wrapper = mountNode()
    const numberInputs = wrapper.findAll('input[type="number"]')
    expect(numberInputs.length).toBe(2)

    const [bounded, free] = numberInputs
    expect(bounded.attributes('min')).toBe('0')
    expect(bounded.attributes('max')).toBe('10')

    // A control with no min/max must stay unbounded (attributes omitted).
    expect(free.attributes('min')).toBeUndefined()
    expect(free.attributes('max')).toBeUndefined()
  })

  it('clamps to max on blur but not while typing', async () => {
    const wrapper = mountNode()
    const flowsStore = useFlowsStore()
    const spy = vi.spyOn(flowsStore, 'updateNodeData').mockImplementation(() => {})

    const bounded = wrapper.findAll('input[type="number"]')[0]

    // Typing an out-of-range value fires @input — stored verbatim, NOT clamped.
    await bounded.setValue('999')
    expect(spy).toHaveBeenLastCalledWith('node-1', { bounded: 999 })

    // Blur settles the value to the declared max.
    await bounded.trigger('blur')
    expect(spy).toHaveBeenLastCalledWith('node-1', { bounded: 10 })
  })

  it('clamps to min on blur', async () => {
    const wrapper = mountNode()
    const flowsStore = useFlowsStore()
    const spy = vi.spyOn(flowsStore, 'updateNodeData').mockImplementation(() => {})

    const bounded = wrapper.findAll('input[type="number"]')[0]
    await bounded.setValue('-50')
    await bounded.trigger('blur')
    expect(spy).toHaveBeenLastCalledWith('node-1', { bounded: 0 })
  })

  it('leaves an unbounded control unchanged on blur', async () => {
    const wrapper = mountNode()
    const flowsStore = useFlowsStore()
    const spy = vi.spyOn(flowsStore, 'updateNodeData').mockImplementation(() => {})

    const free = wrapper.findAll('input[type="number"]')[1]
    await free.setValue('99999')
    await free.trigger('blur')
    expect(spy).toHaveBeenLastCalledWith('node-1', { free: 99999 })
  })
})

