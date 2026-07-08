import { ref } from 'vue'

/**
 * Shared primitive for LATCH's `role="application"` keyboard surfaces — the node
 * canvas (`useCanvasKeyboard`) and the four control editors (Envelope/EQ/Waveform/
 * XY). Each is a self-owned keyboard widget that gates its visible cursor/selection
 * on keyboard focus, so they all need the same tiny piece: a `focused` flag plus the
 * focus/blur handlers that maintain it.
 *
 * Announcements are deliberately NOT here — they differ per surface (the canvas sets
 * an imperative live-region string; the editors bind a reactive `valueText` computed),
 * so folding them in would give most consumers a surface they ignore. Keeping this to
 * the genuinely-universal part is what lets all five surfaces share it honestly.
 */
export function useApplicationKeyboard() {
  const focused = ref(false)

  function onFocus() {
    focused.value = true
  }

  function onBlur() {
    focused.value = false
  }

  return { focused, onFocus, onBlur }
}
