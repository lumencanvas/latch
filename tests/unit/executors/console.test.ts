import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { consoleExecutor, disposeAllDebugState } from '@/engine/executors'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

function ctx(
  nodeId: string,
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 1 / 60,
    totalTime: 0,
    frameCount: 1,
  }
}

describe('consoleExecutor', () => {
  let spy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    disposeAllDebugState()
    spy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    spy.mockRestore()
    disposeAllDebugState()
  })

  it('logs the value with its label (feeds the Debug panel via console.log)', () => {
    consoleExecutor(ctx('c', { value: 42 }, { label: 'Score', logOnChange: true }))
    expect(spy).toHaveBeenCalledWith('[Score]', 42)
  })

  it('defaults the label to "Log"', () => {
    consoleExecutor(ctx('c', { value: 'hi' }))
    expect(spy).toHaveBeenCalledWith('[Log]', 'hi')
  })

  it('dedupes unchanged primitives when On Change is enabled', () => {
    consoleExecutor(ctx('c', { value: 5 }, { logOnChange: true }))
    consoleExecutor(ctx('c', { value: 5 }, { logOnChange: true }))
    expect(spy).toHaveBeenCalledTimes(1)
    consoleExecutor(ctx('c', { value: 6 }, { logOnChange: true }))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('logs every frame when On Change is disabled', () => {
    consoleExecutor(ctx('c', { value: 5 }, { logOnChange: false }))
    consoleExecutor(ctx('c', { value: 5 }, { logOnChange: false }))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('dedupes objects by value, not reference', () => {
    consoleExecutor(ctx('c', { value: { a: 1 } }, { logOnChange: true }))
    consoleExecutor(ctx('c', { value: { a: 1 } }, { logOnChange: true })) // new ref, same content
    expect(spy).toHaveBeenCalledTimes(1)
    consoleExecutor(ctx('c', { value: { a: 2 } }, { logOnChange: true }))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('does nothing when no value is connected', () => {
    consoleExecutor(ctx('c', {}, { logOnChange: false }))
    expect(spy).not.toHaveBeenCalled()
  })
})
