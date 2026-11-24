/**
 * Send/Receive regressions: Send's trigger was level-tested (re-sent every frame while held),
 * and a Receive that executed BEFORE its Send in a frame (unwired → arbitrary topo order)
 * never saw `changed`, because the bus's per-frame change flag was cleared at end-of-frame.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { messageBus } from '@/services/messaging/MessageBus'
import { sendExecutor, receiveExecutor, disposeAllMessagingState } from '@/engine/executors/messaging'
import { collectedLifecycles } from '@/engine/nodeState'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

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
const endFrame = () => collectedLifecycles().find((l) => l.label === 'messaging-bus')!.endFrame!()

describe('send trigger', () => {
  beforeEach(() => disposeAllMessagingState())

  it('fires on the rising edge only (held trigger does not resend every frame)', () => {
    const spy = vi.spyOn(messageBus, 'send')
    const run = (trigger: number) =>
      sendExecutor(ctx('s1', { value: 5, trigger }, { channel: 'c', sendOnChange: false }))
    run(1)
    run(1)
    run(1)
    expect(spy).toHaveBeenCalledTimes(1)
    run(0)
    run(1)
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })
})

describe('receive ordering', () => {
  beforeEach(() => disposeAllMessagingState())

  it('a receiver that runs BEFORE the sender still reports `changed` (next frame)', () => {
    const recv = () => receiveExecutor(ctx('r1', {}, { channel: 'ch' })) as Map<string, unknown>
    // frame 1: receiver first, then sender
    expect(recv().get('changed')).toBe(0)
    sendExecutor(ctx('s2', { value: 'a' }, { channel: 'ch' }))
    endFrame()
    // frame 2: the flag is gone, but the value moved since the receiver last looked
    const out = recv()
    expect(out.get('value')).toBe('a')
    expect(out.get('changed')).toBe(1)
    endFrame()
    // frame 3: nothing new
    expect(recv().get('changed')).toBe(0)
  })

  it('a receiver that runs AFTER the sender fires once (no double fire next frame)', () => {
    const recv = () => receiveExecutor(ctx('r2', {}, { channel: 'ch2' })) as Map<string, unknown>
    recv()
    endFrame()
    sendExecutor(ctx('s3', { value: 'x' }, { channel: 'ch2' }))
    expect(recv().get('changed')).toBe(1)
    endFrame()
    expect(recv().get('changed')).toBe(0)
  })
})
