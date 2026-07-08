import { describe, it, expect } from 'vitest'
import { useApplicationKeyboard } from '@/composables/useApplicationKeyboard'

/**
 * The shared focus primitive behind every role="application" surface (the node
 * canvas + the Envelope/EQ/Waveform editors). Small, but its contract matters:
 * each surface must own an independent focus flag.
 */
describe('useApplicationKeyboard', () => {
  it('starts unfocused and toggles the flag on focus/blur', () => {
    const { focused, onFocus, onBlur } = useApplicationKeyboard()
    expect(focused.value).toBe(false)
    onFocus()
    expect(focused.value).toBe(true)
    onBlur()
    expect(focused.value).toBe(false)
  })

  it('gives each surface its own independent focus state (not a shared singleton)', () => {
    const a = useApplicationKeyboard()
    const b = useApplicationKeyboard()
    a.onFocus()
    expect(a.focused.value).toBe(true)
    expect(b.focused.value).toBe(false)
  })
})
