import { describe, it, expect, afterEach } from 'vitest'
import { llmExecutor } from '@/engine/executors'
import { webLLMService } from '@/services/ai/WebLLMService'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

function ctx(
  nodeId: string,
  inputs: Record<string, unknown>,
  controls: Record<string, unknown> = {},
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 0,
    totalTime: 0,
    frameCount: 0,
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('llmExecutor', () => {
  // The executor drives the shared webLLMService singleton; reset between tests.
  afterEach(async () => {
    await webLLMService.disposeAll()
  })

  it('outputs idle values with no trigger', () => {
    const out = llmExecutor(ctx('idle', {})) as Map<string, unknown>
    expect(out.get('text')).toBe('')
    expect(out.get('generating')).toBe(false)
    expect(out.get('done')).toBe(false)
  })

  it('reports unsupported after a trigger when WebGPU is absent (test env)', async () => {
    // Rising edge with a prompt kicks off generation (fire-and-forget).
    llmExecutor(ctx('gen', { trigger: true, prompt: 'hello' }))
    await flush() // let the async capability check settle
    const out = llmExecutor(ctx('gen', {})) as Map<string, unknown>
    expect(out.get('supported')).toBe(false)
    expect(out.get('generating')).toBe(false)
  })

  it('does not start generation without a prompt', async () => {
    llmExecutor(ctx('noprompt', { trigger: true }))
    await flush()
    const out = llmExecutor(ctx('noprompt', {})) as Map<string, unknown>
    // No generation attempted -> state stays idle (supported optimistic).
    expect(out.get('supported')).toBe(true)
    expect(out.get('generating')).toBe(false)
  })
})
