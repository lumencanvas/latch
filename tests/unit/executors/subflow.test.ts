import { describe, it, expect, beforeEach } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import type { FlowState } from '@/stores/flows'
import {
  subflowInputExecutor,
  subflowOutputExecutor,
  subflowExecutor,
  getSubflowContext,
  clearAllSubflowContexts,
} from '@/engine/executors/subflow'

function ctx(nodeId: string, inputs: Record<string, unknown> = {}, controls: Record<string, unknown> = {}): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    deltaTime: 0.016,
    totalTime: 0,
    frameCount: 0,
  } as unknown as ExecutionContext
}

describe('subflow input/output — context port round-trip', () => {
  beforeEach(() => clearAllSubflowContexts())

  it('subflowInput reads the value the parent placed in the instance context', () => {
    getSubflowContext('inst-1').set('input:freq', 440)
    const out = subflowInputExecutor(ctx('n', {}, { portId: 'freq', _subflowInstanceId: 'inst-1' }))
    expect(out.get('value')).toBe(440)
  })

  it('subflowInput falls back to defaultValue when not inside a subflow instance', () => {
    const out = subflowInputExecutor(ctx('n', {}, { portId: 'freq', defaultValue: 7 })) // no _subflowInstanceId
    expect(out.get('value')).toBe(7)
    expect(subflowInputExecutor(ctx('n', {}, { portId: 'freq' })).get('value')).toBeNull() // no default → null
  })

  it('subflowOutput writes into the instance context under output:<portId> and echoes _display', () => {
    const out = subflowOutputExecutor(ctx('n', { value: 99 }, { portId: 'level', _subflowInstanceId: 'inst-2' }))
    expect(out.get('_display')).toBe(99)
    expect(getSubflowContext('inst-2').get('output:level')).toBe(99) // the parent reads this back
  })

  it('input:<port> and output:<port> are separate namespaces (no accidental crosstalk)', () => {
    getSubflowContext('inst-3').set('input:x', 'in')
    subflowOutputExecutor(ctx('n', { value: 'out' }, { portId: 'x', _subflowInstanceId: 'inst-3' }))
    const c = getSubflowContext('inst-3')
    expect(c.get('input:x')).toBe('in')
    expect(c.get('output:x')).toBe('out')
  })
})

describe('subflowExecutor — resolver guards', () => {
  beforeEach(() => clearAllSubflowContexts())

  it('errors when no subflowId is set', () => {
    expect(subflowExecutor(ctx('inst', {}, {})).get('_error')).toBe('No subflow ID specified')
  })

  it('errors when the subflow resolver is not injected', () => {
    expect(subflowExecutor(ctx('inst', {}, { subflowId: 'sf1' })).get('_error')).toBe('Subflow resolver not available')
  })

  it('errors when the resolver cannot find the subflow', () => {
    const out = subflowExecutor(ctx('inst', {}, { subflowId: 'missing', _getSubflow: () => undefined }))
    expect(out.get('_error')).toBe('Subflow not found: missing')
  })

  it('without an executeNode injector, degrades to null for each declared output port (no throw)', () => {
    const subflow = {
      subflowInputs: [{ id: 'in1' }],
      subflowOutputs: [{ id: 'out1' }, { id: 'out2' }],
      nodes: [],
      edges: [],
    } as unknown as FlowState
    const out = subflowExecutor(ctx('inst', {}, { subflowId: 'sf', _getSubflow: () => subflow }))
    expect(out.get('out1')).toBeNull()
    expect(out.get('out2')).toBeNull()
    expect(out.has('_error')).toBe(false)
  })
})
