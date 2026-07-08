import { ref } from 'vue'

/**
 * Shared scaffolding for LATCH's `role="application"` keyboard surfaces — the node
 * canvas (`useCanvasKeyboard`) and the four control editors (Envelope/EQ/Waveform/
 * XY). Each of those is a self-owned keyboard widget with the same three pieces:
 *
 *  - a `focused` flag (gates the visible cursor/selection so it only shows while the
 *    surface has keyboard focus),
 *  - a polite live-region `announce` string (screen-reader feedback for every move),
 *  - base `onFocus`/`onBlur` handlers.
 *
 * The surface-specific interaction machine builds on top and wraps `onFocus`/`onBlur`
 * to add its own enter/leave behaviour. Extracting this keeps the a11y contract in
 * one place instead of copy-pasted across five components.
 */
export function useApplicationKeyboard() {
  const focused = ref(false)
  const announce = ref('')

  function onFocus() {
    focused.value = true
  }

  function onBlur() {
    focused.value = false
  }

  return { focused, announce, onFocus, onBlur }
}
