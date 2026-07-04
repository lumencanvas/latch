import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useDialogA11y } from '@/composables/useDialogA11y'

/**
 * A minimal host that exercises the composable the way a real modal does:
 * an always-mounted opener button + a v-if dialog (overlay > container with
 * three focusable buttons). Mirrors the Teleport-modal shape without the CSS.
 */
function makeHost(closeOnEscape = true) {
  return defineComponent({
    setup(_, { expose }) {
      const open = ref(false)
      const container = ref<HTMLElement | null>(null)
      const opener = ref<HTMLElement | null>(null)
      const closeCount = ref(0)
      const { onKeydown } = useDialogA11y({
        isOpen: () => open.value,
        container,
        onClose: () => {
          open.value = false
          closeCount.value++
        },
        closeOnEscape,
      })
      expose({ open, container, opener, closeCount, onKeydown })
      return { open, container, opener, closeCount, onKeydown }
    },
    render() {
      return h('div', [
        h('button', { class: 'opener', ref: (el) => { this.opener = el as HTMLElement } }, 'open'),
        this.open
          ? h('div', { class: 'overlay', onKeydown: this.onKeydown }, [
              h('div', { class: 'dialog', role: 'dialog', ref: (el) => { this.container = el as HTMLElement } }, [
                h('button', { class: 'b1' }, 'one'),
                h('button', { class: 'b2' }, 'two'),
                h('button', { class: 'b3' }, 'three'),
              ]),
            ])
          : null,
      ])
    },
  })
}

async function settle() {
  await nextTick()
  await nextTick()
}

describe('useDialogA11y', () => {
  it('moves focus into the dialog (first focusable) when opened', async () => {
    const wrapper = mount(makeHost(), { attachTo: document.body })
    const opener = wrapper.vm.opener as HTMLElement
    opener.focus()
    expect(document.activeElement).toBe(opener)

    wrapper.vm.open = true
    await settle()

    const first = document.querySelector('.b1') as HTMLElement
    expect(document.activeElement).toBe(first)
    wrapper.unmount()
  })

  it('restores focus to the opener when closed', async () => {
    const wrapper = mount(makeHost(), { attachTo: document.body })
    const opener = wrapper.vm.opener as HTMLElement
    opener.focus()

    wrapper.vm.open = true
    await settle()
    expect(document.activeElement).not.toBe(opener)

    wrapper.vm.open = false
    await settle()
    expect(document.activeElement).toBe(opener)
    wrapper.unmount()
  })

  it('closes on Escape', async () => {
    const wrapper = mount(makeHost(), { attachTo: document.body })
    wrapper.vm.open = true
    await settle()

    const overlay = document.querySelector('.overlay') as HTMLElement
    const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    overlay.dispatchEvent(evt)
    await settle()

    expect(wrapper.vm.closeCount).toBe(1)
    expect(wrapper.vm.open).toBe(false)
    expect(evt.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('traps Tab from the last focusable back to the first', async () => {
    const wrapper = mount(makeHost(), { attachTo: document.body })
    wrapper.vm.open = true
    await settle()

    const first = document.querySelector('.b1') as HTMLElement
    const last = document.querySelector('.b3') as HTMLElement
    last.focus()

    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    ;(document.querySelector('.overlay') as HTMLElement).dispatchEvent(evt)
    await settle()

    expect(evt.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
    wrapper.unmount()
  })

  it('traps Shift+Tab from the first focusable to the last', async () => {
    const wrapper = mount(makeHost(), { attachTo: document.body })
    wrapper.vm.open = true
    await settle()

    const first = document.querySelector('.b1') as HTMLElement
    const last = document.querySelector('.b3') as HTMLElement
    first.focus()

    const evt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    ;(document.querySelector('.overlay') as HTMLElement).dispatchEvent(evt)
    await settle()

    expect(evt.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
    wrapper.unmount()
  })

  it('does not trap Tab in the middle (lets focus move naturally)', async () => {
    const wrapper = mount(makeHost(), { attachTo: document.body })
    wrapper.vm.open = true
    await settle()

    const mid = document.querySelector('.b2') as HTMLElement
    mid.focus()

    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    ;(document.querySelector('.overlay') as HTMLElement).dispatchEvent(evt)
    await settle()

    expect(evt.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(mid)
    wrapper.unmount()
  })

  it('respects closeOnEscape: false', async () => {
    const wrapper = mount(makeHost(false), { attachTo: document.body })
    wrapper.vm.open = true
    await settle()

    const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    ;(document.querySelector('.overlay') as HTMLElement).dispatchEvent(evt)
    await settle()

    expect(wrapper.vm.closeCount).toBe(0)
    expect(wrapper.vm.open).toBe(true)
    expect(evt.defaultPrevented).toBe(false)
    wrapper.unmount()
  })
})
