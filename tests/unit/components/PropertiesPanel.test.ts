import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
// Import the store chain BEFORE the .vue files (see BaseNode.test.ts) so the
// markRaw(component) cycle in registry/components.ts is fully resolved first.
import { useNodesStore, type NodeDefinition } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'
import PropertiesPanel from '@/components/layout/PropertiesPanel.vue'
import ControlRenderer from '@/components/controls/ControlRenderer.vue'
import NodeView from '@/components/controls/NodeView.vue'

/**
 * Guards the Phase-3 migration WIRING on the panel side (the audit found PropertiesPanel was
 * mounted by zero tests, leaving the whole delegate/undo chain unguarded). We stub the heavy
 * children — including <ControlRenderer>, which is unit-tested on its own — and assert the panel
 * (a) routes each primitive control to <ControlRenderer context="panel"> with the right model
 * value, (b) commits an emitted `update` through updateNodeData (the recorded/undoable write), and
 * (c) does NOT route a non-primitive control (code) to <ControlRenderer>.
 */
function def(): NodeDefinition {
  return {
    id: 'panel-test',
    name: 'Panel Test',
    version: '1.0.0',
    category: 'data',
    description: 'x',
    icon: 'box',
    platforms: ['web', 'electron'],
    inputs: [],
    outputs: [],
    controls: [
      { id: 'amount', type: 'number', label: 'Amount', default: 5, props: { min: 0, max: 100 } },
      { id: 'snippet', type: 'code', label: 'Snippet', default: '' },
    ],
  }
}

function mountPanel() {
  const nodesStore = useNodesStore()
  nodesStore.register(def())
  const flowsStore = useFlowsStore()
  flowsStore.createFlow('t')
  const node = flowsStore.addNode('panel-test', { x: 0, y: 0 }, { amount: 7 })!
  useUIStore().setInspectedNode(node.id)

  const wrapper = mount(PropertiesPanel, {
    global: {
      stubs: {
        TexturePreview: true,
        ConnectionSelect: true,
        TemplateSelect: true,
        HttpTemplateEditor: true,
        AssetPickerControl: true,
        DebugPanel: true,
      },
    },
  })
  return { wrapper, nodeId: node.id }
}

describe('PropertiesPanel — ControlRenderer delegation', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('routes a primitive control to <ControlRenderer context="panel"> with its current value', () => {
    const { wrapper } = mountPanel()
    const crs = wrapper.findAllComponents(ControlRenderer)
    // Only the primitive (number) control delegates; the code control does not.
    expect(crs.length).toBe(1)
    const cr = crs[0]
    expect(cr.props('context')).toBe('panel')
    expect(cr.props('modelValue')).toBe(7)
    expect((cr.props('control') as { id: string }).id).toBe('amount')
  })

  it('does NOT route a non-primitive (code) control to <ControlRenderer>', () => {
    const { wrapper } = mountPanel()
    // The code control renders its inline preview, not a ControlRenderer.
    expect(wrapper.find('.control-code').exists()).toBe(true)
    expect(wrapper.findAllComponents(ControlRenderer).length).toBe(1)
  })

  it('commits an emitted update through the recorded updateNodeData write', async () => {
    const { wrapper, nodeId } = mountPanel()
    const flowsStore = useFlowsStore()
    const spy = vi.spyOn(flowsStore, 'updateNodeData').mockImplementation(() => {})

    await wrapper.findComponent(ControlRenderer).vm.$emit('update', 42)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(nodeId, { amount: 42 })
  })

  it('renders <NodeView surface="panel"> and commits its update when the def has a ui schema', async () => {
    useNodesStore().register({
      id: 'ui-node',
      name: 'UI',
      version: '1.0.0',
      category: 'data',
      description: 'x',
      icon: 'box',
      platforms: ['web', 'electron'],
      inputs: [],
      outputs: [],
      controls: [{ id: 'amount', type: 'slider', label: 'Amount', default: 3, props: { min: 0, max: 10 } }],
      ui: { rows: [{ widgets: [{ type: 'slider', bind: 'amount' }] }] },
    })
    const flowsStore = useFlowsStore()
    flowsStore.createFlow('t')
    const node = flowsStore.addNode('ui-node', { x: 0, y: 0 }, { amount: 3 })!
    useUIStore().setInspectedNode(node.id)
    const wrapper = mount(PropertiesPanel, {
      global: {
        stubs: {
          TexturePreview: true, ConnectionSelect: true, TemplateSelect: true,
          HttpTemplateEditor: true, AssetPickerControl: true, DebugPanel: true,
        },
      },
    })
    const nv = wrapper.findComponent(NodeView)
    expect(nv.exists()).toBe(true)
    expect(nv.props('surface')).toBe('panel')

    const spy = vi.spyOn(flowsStore, 'updateNodeData').mockImplementation(() => {})
    nv.vm.$emit('update', 'amount', 7)
    expect(spy).toHaveBeenCalledWith(node.id, { amount: 7 })
  })
})

describe('PropertiesPanel — conditional visibility via evaluateWhen', () => {
  beforeEach(() => setActivePinia(createPinia()))

  // `vis` is the visibility declaration on the dependent control — the canonical `when` OR the
  // legacy panel-only `props.showWhen`. (Before Phase 3, the panel ignored `visibleWhen`; honoring
  // the canonical `when` is the 3b harmonization that makes it consistent with the canvas.)
  function mountWith(triggerValue: string, vis: Record<string, unknown>) {
    const nodesStore = useNodesStore()
    nodesStore.register({
      id: 'sw-test',
      name: 'ShowWhen',
      version: '1.0.0',
      category: 'data',
      description: 'x',
      icon: 'box',
      platforms: ['web', 'electron'],
      inputs: [],
      outputs: [],
      controls: [
        { id: 'trigger', type: 'select', label: 'Trigger', default: 'off', props: { options: ['off', 'on'] } },
        { id: 'dependent', type: 'number', label: 'Dependent', default: 0, ...vis },
      ],
    })
    const flowsStore = useFlowsStore()
    flowsStore.createFlow('t')
    const node = flowsStore.addNode('sw-test', { x: 0, y: 0 }, { trigger: triggerValue })!
    useUIStore().setInspectedNode(node.id)
    const wrapper = mount(PropertiesPanel, {
      global: {
        stubs: {
          TexturePreview: true,
          ConnectionSelect: true,
          TemplateSelect: true,
          HttpTemplateEditor: true,
          AssetPickerControl: true,
          DebugPanel: true,
        },
      },
    })
    const dep = wrapper.findAll('.control-item').find((i) => i.text().includes('Dependent'))!
    // v-show renders the element but toggles inline `display: none` — assert on that directly
    // (test-utils isVisible() doesn't observe inline styles on a detached mount here).
    return dep.attributes('style') ?? ''
  }

  it('honors the canonical `when` (the panel/canvas harmonization)', () => {
    expect(mountWith('off', { when: { trigger: 'on' } })).toContain('display: none')
    expect(mountWith('on', { when: { trigger: 'on' } })).not.toContain('display: none')
  })

  it('still honors the legacy `props.showWhen`', () => {
    expect(mountWith('off', { props: { showWhen: { trigger: 'on' } } })).toContain('display: none')
    expect(mountWith('on', { props: { showWhen: { trigger: 'on' } } })).not.toContain('display: none')
  })
})
