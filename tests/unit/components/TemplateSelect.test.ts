import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
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

/**
 * The dropdown declares role="listbox" with role="option" children, so it must
 * honour the listbox keyboard model: focus moves onto an option when it opens,
 * Arrow/Home/End move between options (wrapping), and Escape closes it and returns
 * focus to the trigger. Options stay individually Tab-reachable so each row's edit
 * affordance remains keyboard-operable.
 */
describe('TemplateSelect listbox keyboard navigation', () => {
  const t1 = { id: 't1', name: 'Get User', method: 'GET', path: '/users/:id' } as HttpEndpointTemplate
  const t2 = { id: 't2', name: 'Create User', method: 'POST', path: '/users' } as HttpEndpointTemplate
  const twoConn = { id: 'c1', name: 'API', protocol: 'http', templates: [t1, t2] } as HttpConnectionConfig

  beforeEach(() => {
    setActivePinia(createPinia())
    useConnectionsStore().connections = [twoConn]
  })

  // Options in DOM order when allowInline: [inline, t1, t2].
  function options() {
    return Array.from(document.querySelectorAll<HTMLElement>('.template-dropdown [role="option"]'))
  }

  async function open(modelValue: string | undefined) {
    const w = mount(TemplateSelect, {
      attachTo: document.body,
      props: { modelValue, connectionId: 'c1', allowInline: true },
    })
    await w.get('button.template-select-trigger').trigger('click')
    await flushPromises()
    return w
  }

  it('focuses the first option when opened with no selection', async () => {
    const w = await open(undefined)
    expect(document.activeElement).toBe(options()[0])
    expect(options()[0].classList.contains('inline-option')).toBe(true)
    w.unmount()
  })

  it('focuses the currently-selected option when opened', async () => {
    const w = await open('t2')
    const active = document.activeElement as HTMLElement
    expect(active.getAttribute('aria-selected')).toBe('true')
    expect(active.textContent).toContain('Create User')
    w.unmount()
  })

  it('ArrowDown moves focus to the next option and wraps at the end', async () => {
    const w = await open(undefined)
    const opts = options()
    await w.get('.template-dropdown').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(opts[1])
    await w.get('.template-dropdown').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(opts[2])
    // wrap back to the first option
    await w.get('.template-dropdown').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(opts[0])
    w.unmount()
  })

  it('ArrowUp from the first option wraps to the last', async () => {
    const w = await open(undefined)
    const opts = options()
    await w.get('.template-dropdown').trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(opts[opts.length - 1])
    w.unmount()
  })

  it('Home and End jump to the first and last option', async () => {
    const w = await open(undefined)
    const opts = options()
    await w.get('.template-dropdown').trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(opts[opts.length - 1])
    await w.get('.template-dropdown').trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(opts[0])
    w.unmount()
  })

  it('Arrow keys from a non-option button (Add Template) land on the last/first option', async () => {
    const w = await open(undefined)
    const opts = options()
    // The add/edit buttons are Tab-reachable and inside the dropdown, so their
    // keydown bubbles to the listbox handler with focus off the option list.
    const addBtn = document.querySelector<HTMLElement>('.add-template-btn')!
    addBtn.focus()
    await w.get('.template-dropdown').trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(opts[opts.length - 1])
    addBtn.focus()
    await w.get('.template-dropdown').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(opts[0])
    w.unmount()
  })

  it('Escape closes the dropdown and restores focus to the trigger', async () => {
    const w = await open(undefined)
    await w.get('.template-dropdown').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(w.find('.template-dropdown').exists()).toBe(false)
    expect(document.activeElement).toBe(w.get('button.template-select-trigger').element)
    w.unmount()
  })
})
