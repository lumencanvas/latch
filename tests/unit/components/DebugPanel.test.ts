import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useRuntimeStore } from '@/stores/runtime'
import { useUIStore } from '@/stores/ui'
import DebugPanel from '@/components/debug/DebugPanel.vue'

/**
 * DebugPanel row keyboard a11y (WCAG 2.1.1). The error/monitor rows used to be
 * mouse-only <div @click="highlightNode">. They are now real <button>s (the rows
 * have no nested interactive content, so a direct button is the cleanest fix) with
 * an accessible name, keyboard-operable by contract. The monitor rows share the
 * identical pattern (verified structurally; the error rows are unit-tested here
 * because they are the ones populable without a full running graph).
 */
describe('DebugPanel error-row keyboard accessibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders each runtime error as a named native button that highlights its node', async () => {
    const runtime = useRuntimeStore()
    const ui = useUIStore()
    runtime.addError({ nodeId: 'node_7', message: 'boom', timestamp: 1 })

    const w = mount(DebugPanel)
    const row = w.get('button.error-item') // native button => keyboard-operable by contract
    expect(row.attributes('aria-label')).toContain('node_7')

    await row.trigger('click')
    expect(ui.inspectedNode).toBe('node_7')
  })
})
