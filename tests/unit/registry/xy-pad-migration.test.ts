import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { xyPadNode } from '@/registry/inputs/xy-pad/definition'
import { CUSTOM_NODE_TYPE_IDS } from '@/registry/components'
import { useRuntimeStore } from '@/stores/runtime'
import NodeView from '@/components/controls/NodeView.vue'
import XYPad from '@/components/controls/XYPad.vue'

/**
 * Phase 3 bullet 2 — third bespoke→`ui` migration. Unlike env/eq (whole body = one aggregate), xy-pad is
 * a MULTI-ROW schema: the `xy` aggregate (normalizedX/Y) + 2 output readouts (rawX/rawY) + 4 range number
 * controls (minX/maxX/minY/maxY). Pins behavioral parity with the bespoke getters/setters + the routing
 * change. Accepted deltas (documented on the definition): the raw readouts are running-only and the range
 * controls render always-visible (no RANGE toggle). Behavioral, not pixel (design Q3).
 */
const VALUES = { normalizedX: 0.25, normalizedY: 0.75, minX: 0, maxX: 1, minY: 0, maxY: 1 }

function mountNode(values = VALUES) {
  return mount(NodeView, {
    props: { nodeId: 'n1', definition: xyPadNode, values, surface: 'node' },
    global: { stubs: { XYPad: true } },
  })
}

describe('xy-pad migrated to declarative `ui`', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('declares an xy aggregate on normalizedX/Y + rawX/Y readouts + 4 range number controls', () => {
    expect(xyPadNode.ui).toEqual({
      rows: [
        { widgets: [{ type: 'xy', bind: '', props: { fields: ['normalizedX', 'normalizedY'] } }] },
        { widgets: [
          { type: 'readout', bind: 'rawX', source: 'output', label: 'X' },
          { type: 'readout', bind: 'rawY', source: 'output', label: 'Y' },
        ] },
        { label: 'Range', widgets: [
          { type: 'number', bind: 'minX', label: 'X Min' },
          { type: 'number', bind: 'maxX', label: 'X Max' },
        ] },
        { widgets: [
          { type: 'number', bind: 'minY', label: 'Y Min' },
          { type: 'number', bind: 'maxY', label: 'Y Max' },
        ] },
      ],
    })
  })

  it('no longer routes through a bespoke SFC (falls back to BaseNode + NodeView)', () => {
    expect(CUSTOM_NODE_TYPE_IDS).not.toContain('xy-pad')
  })

  it('assembles {x,y} from normalizedX/Y and disperses edits back to those controls', () => {
    const w = mountNode()
    const xy = w.findComponent(XYPad)
    expect(xy.props('modelValue')).toEqual({ x: 0.25, y: 0.75 })
    xy.vm.$emit('update:modelValue', { x: 0.1, y: 0.9 })
    expect(w.emitted('update')).toEqual([['normalizedX', 0.1], ['normalizedY', 0.9]])
  })

  it('renders the 4 range controls as number inputs bound to minX/maxX/minY/maxY', async () => {
    const w = mountNode()
    const inputs = w.findAll('input[type="number"]')
    expect(inputs).toHaveLength(4)
    expect((inputs[0].element as HTMLInputElement).value).toBe('0') // minX
    expect((inputs[1].element as HTMLInputElement).value).toBe('1') // maxX
    await inputs[1].setValue('5') // edit maxX
    expect(w.emitted('update')?.at(-1)).toEqual(['maxX', 5])
  })

  it('renders rawX/rawY as output readouts (running-only; from runtime metrics)', () => {
    useRuntimeStore().updateNodeMetrics('n1', { outputValues: { rawX: 0.5, rawY: 0.3 } })
    const readouts = mountNode().findAll('.nv-readout')
    expect(readouts).toHaveLength(2)
    expect(readouts[0].text()).toBe('0.500') // toFixed(3) formatter
    expect(readouts[1].text()).toBe('0.300')
  })
})
