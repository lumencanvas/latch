import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import ConnectionSelect from '@/components/connections/ConnectionSelect.vue'

/**
 * ConnectionSelect accessible name (WCAG 4.1.2 / 1.3.1). The native <select> had
 * no programmatically associated label, so assistive tech announced it namelessly.
 */
describe('ConnectionSelect accessible name', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('names the select from its placeholder', () => {
    const w = mount(ConnectionSelect, { props: { modelValue: undefined, protocol: 'mqtt', placeholder: 'Pick a broker' } })
    expect(w.get('select.connection-select').attributes('aria-label')).toBe('Pick a broker')
  })

  it('falls back to a default accessible name', () => {
    const w = mount(ConnectionSelect, { props: { modelValue: undefined, protocol: 'mqtt' } })
    expect(w.get('select.connection-select').attributes('aria-label')).toBe('Select connection')
  })
})
