import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useConnectionsStore } from '@/stores/connections'
import ConnectionList from '@/components/connections/ConnectionList.vue'
import type { BaseConnectionConfig, ConnectionTypeDefinition } from '@/services/connections/types'

/**
 * ConnectionList row keyboard a11y (WCAG 2.1.1). Each row used to be a mouse-only
 * <div @click>, so a keyboard user could not select/edit a connection. The row's
 * select target is now a real <button> (Tab-reachable, Enter/Space-activatable)
 * with an accessible name; the quick connect/disconnect controls stay as sibling
 * buttons (no nested interactive content).
 */
const conn = { id: 'c1', name: 'My MQTT', protocol: 'mqtt' } as BaseConnectionConfig
const typeDef = { id: 'mqtt', name: 'MQTT', icon: 'radio', color: '#0af' } as ConnectionTypeDefinition

describe('ConnectionList keyboard accessibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useConnectionsStore()
    store.connections = [conn]
    store.types = [typeDef]
  })

  it('exposes each row select target as a native button with an accessible name', () => {
    const w = mount(ConnectionList)
    const select = w.get('button.connection-select')
    expect(select.attributes('aria-label')).toContain('My MQTT')
  })

  it('emits select when the row button is activated', async () => {
    const w = mount(ConnectionList)
    await w.get('button.connection-select').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual(['c1'])
  })

  it('selects when the whole row is clicked (delegated, not just the button)', async () => {
    // The row button's click is delegated to the .connection-item container so the
    // full row is a mouse target; clicking the row (not the button) must still select.
    const w = mount(ConnectionList)
    await w.get('.connection-item').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual(['c1'])
  })

  it('marks the selected row with aria-current', () => {
    const w = mount(ConnectionList, { props: { selectedId: 'c1' } })
    expect(w.get('button.connection-select').attributes('aria-current')).toBe('true')
  })
})
