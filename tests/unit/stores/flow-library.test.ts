import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFlowsStore } from '@/stores/flows'
import { looksLikeFlowText } from '@/composables/useFlowLibrary'

describe('flow library: open vs saved flows', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('closing a tab keeps the flow; closing the active one switches to a neighbour', () => {
    const s = useFlowsStore()
    const a = s.createFlow('A')
    const b = s.createFlow('B')
    expect(s.activeFlowId).toBe(b.id)
    s.closeFlow(b.id)
    expect(s.mainFlows.map((f) => f.name)).toEqual(['A', 'B'])
    expect(s.openFlows.map((f) => f.name)).toEqual(['A'])
    expect(s.activeFlowId).toBe(a.id)
  })

  it('closing the last tab opens a fresh Untitled flow, and reopening restores the tab', () => {
    const s = useFlowsStore()
    const a = s.createFlow('A')
    const changed = s.closeFlow(a.id)
    expect(changed).toHaveLength(2)
    expect(s.openFlows.map((f) => f.name)).toEqual(['Untitled Flow'])
    s.openFlow(a.id)
    expect(s.openFlows.map((f) => f.name)).toContain('A')
    expect(s.activeFlowId).toBe(a.id)
  })

  it('one flow round-trips: its exported JSON is recognised and imports as a new, open flow', () => {
    const s = useFlowsStore()
    const a = s.createFlow('Share Me')
    const json = s.exportFlow(a.id)
    expect(looksLikeFlowText(json)).toBe(true)
    expect(looksLikeFlowText('hello')).toBe(false)
    expect(looksLikeFlowText('{"not":"latch"}')).toBe(false)
    const r = s.importFlows(json, { replace: false })
    expect(r.success).toBe(true)
    expect(r.flowIds).toHaveLength(1)
    const imported = s.getFlowById(r.flowIds![0])!
    expect(imported.name).toContain('Share Me')
    expect(imported.open).toBe(true)
  })
})
