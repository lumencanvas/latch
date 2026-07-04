import { nextTick, watch, type Ref } from 'vue'

/**
 * Accessibility plumbing shared by every modal dialog: focus move-in on open,
 * focus restore to the opener on close, a Tab focus-trap, and Escape-to-close.
 *
 * Deliberately a composable (not a wrapper component) so each modal keeps its
 * own bespoke overlay/container markup and CSS — this only adds behaviour. The
 * host is responsible for the ARIA attributes (`role="dialog"`, `aria-modal`,
 * `aria-labelledby`); this owns the keyboard/focus behaviour that those roles
 * promise (WCAG 2.4.3 focus order, 2.1.2 no keyboard trap, 2.1.1 keyboard).
 *
 * Bind the returned `onKeydown` to the dialog's OVERLAY element (`@keydown`),
 * and pass a template ref to the dialog CONTAINER as `container`. Because focus
 * is moved into the container on open, the overlay keydown reliably receives
 * Escape/Tab (they bubble up from the focused descendant).
 */
export interface DialogA11yOptions {
  /** Reactive open state — a ref or a getter. */
  isOpen: Ref<boolean> | (() => boolean)
  /** Template ref to the dialog container element (the `role="dialog"` node). */
  container: Ref<HTMLElement | null>
  /** Called when Escape is pressed (unless `closeOnEscape` is false). */
  onClose: () => void
  /** Close the dialog on Escape. Default true. */
  closeOnEscape?: boolean
  /** Move focus into the dialog on open. Default true. */
  autoFocus?: boolean
}

// Elements that can receive keyboard focus. Excludes tabindex="-1" and disabled.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useDialogA11y(options: DialogA11yOptions) {
  const { container, onClose } = options
  const closeOnEscape = options.closeOnEscape !== false
  const autoFocus = options.autoFocus !== false
  const isOpen = typeof options.isOpen === 'function'
    ? options.isOpen
    : () => (options.isOpen as Ref<boolean>).value

  // The element that had focus before the dialog opened, to restore on close.
  let previouslyFocused: HTMLElement | null = null

  function focusableWithin(): HTMLElement[] {
    const el = container.value
    if (!el) return []
    return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  }

  function activate() {
    // Capture the opener BEFORE the DOM/focus changes (watch runs pre-render).
    previouslyFocused = (document.activeElement as HTMLElement | null) ?? null
    if (!autoFocus) return
    // The container is behind v-if — wait for it to render before focusing.
    nextTick(() => {
      const el = container.value
      if (!el) return
      const preferred = el.querySelector<HTMLElement>('[data-autofocus]')
      const target = preferred ?? focusableWithin()[0] ?? el
      if (target === el && !el.hasAttribute('tabindex')) {
        // Fallback: make the container itself focusable so focus lands inside.
        el.setAttribute('tabindex', '-1')
      }
      target.focus()
    })
  }

  function restore() {
    const prev = previouslyFocused
    previouslyFocused = null
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
      prev.focus()
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (closeOnEscape && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }

    if (event.key !== 'Tab') return

    const focusable = focusableWithin()
    const el = container.value
    const active = document.activeElement as HTMLElement | null

    // Nothing focusable inside — keep focus on the container, don't escape it.
    if (focusable.length === 0) {
      if (el) {
        event.preventDefault()
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
        el.focus()
      }
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const outside = !el || !active || !el.contains(active)

    if (event.shiftKey) {
      if (active === first || outside) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (active === last || outside) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  watch(isOpen, (open, wasOpen) => {
    if (open && !wasOpen) activate()
    else if (!open && wasOpen) restore()
  })

  return { onKeydown }
}
