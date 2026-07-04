import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useConnectionsStore } from '@/stores/connections'
import TemplateSelect from '@/components/connections/TemplateSelect.vue'
import type { HttpConnectionConfig, HttpEndpointTemplate } from '@/services/connections/types'

/**
 * TemplateSelect keyboard a11y (WCAG 2.1.1 / 4.1.2). The per-template edit
 * affordance used to be a non-focusable <span role="button"> nested inside the
 * option <button> (invalid nested-interactive + unreachable by keyboard). The row
 * is now a container with the select target and the edit control as sibling
 * <button>s; the trigger exposes aria-expanded and the options are role="option".
 */
const template = { id: 't1', name: 'Get User', method: 'GET', path: '/users/:id' } as HttpEndpointTemplate
const conn = { id: 'c1', name: 'API', protocol: 'http', templates: [template] } as HttpConnectionConfig

describe('TemplateSelect keyboard accessibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useConnectionsStore()
    store.connections = [conn]
  })

  function openDropdown() {
    const w = mount(TemplateSelect, { props: { modelValue: undefined, connectionId: 'c1', allowInline: true } })
    return w
  }

  it('trigger exposes aria-expanded reflecting the open state', async () => {
    const w = openDropdown()
    const trigger = w.get('button.template-select-trigger')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
  })

  it('exposes the edit control as a named sibling button that emits edit-template only', async () => {
    const w = openDropdown()
    await w.get('button.template-select-trigger').trigger('click')
    const edit = w.get('button.edit-btn')
    expect(edit.attributes('aria-label')).toContain('Get User')
    await edit.trigger('click')
    expect(w.emitted('edit-template')?.[0]).toEqual(['t1'])
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('exposes each template as a role=option button', async () => {
    const w = openDropdown()
    await w.get('button.template-select-trigger').trigger('click')
    const option = w.get('.template-option-row button.template-option')
    expect(option.attributes('role')).toBe('option')
    await option.trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['t1'])
  })
})
