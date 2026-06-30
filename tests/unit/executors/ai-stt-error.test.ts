import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// Drive the real STT executor through a transcription failure and assert it now
// surfaces on the public `error` port (previously swallowed into console.error).
const h = vi.hoisted(() => {
  const svc = {
    setVadThreshold: vi.fn(),
    setVadSilenceDuration: vi.fn(),
    connectSource: vi.fn(async () => {}),
    disconnect: vi.fn(),
    connected: true,
    getVadState: () => ({ speaking: false }),
    getBuffer: () => new Float32Array([0.1, 0.2, 0.3]),
    getFullBuffer: () => new Float32Array([0.1, 0.2, 0.3]),
    clearBuffer: vi.fn(),
  }
  return { svc, transcribe: vi.fn(async () => 'hello') }
})

vi.mock('@/services/ai/AIInference', () => ({
  aiInference: {
    isModelLoaded: () => true,
    getModelInfo: () => ({ progress: 0 }),
    getDefaultModel: () => 'default',
    transcribe: h.transcribe,
  },
}))
vi.mock('@/services/audio/AudioBufferService', () => ({
  AudioBufferServiceImpl: vi.fn(() => h.svc),
}))

import { speechRecognitionExecutor } from '@/engine/executors/ai'

const flush = () => new Promise((r) => setTimeout(r, 0))
const toneNode = { connect: () => {} } // duck-typed Tone audio node

function ctx(nodeId: string, inputs: Record<string, unknown>, controls: Record<string, unknown>): ExecutionContext {
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

beforeEach(() => {
  h.transcribe.mockReset()
})

describe('speechRecognitionExecutor — transcribe error surfacing', () => {
  it('surfaces a thrown transcription error on the public error port', async () => {
    h.transcribe.mockRejectedValue(new Error('stt-boom'))
    const node = 'stt-err'

    speechRecognitionExecutor(ctx(node, { audio: toneNode, trigger: true }, { mode: 'manual' }))
    await flush() // connectSource resolves → connecting clears

    speechRecognitionExecutor(ctx(node, { audio: toneNode, trigger: true }, { mode: 'manual' }))
    await flush() // transcribe rejects → error cached

    const out = speechRecognitionExecutor(ctx(node, { audio: toneNode }, { mode: 'manual' })) as Map<string, unknown>
    expect(out.get('error')).toBe('stt-boom')
  })

  it('clears the error after a successful transcription', async () => {
    h.transcribe.mockResolvedValue('transcribed text')
    const node = 'stt-ok'

    speechRecognitionExecutor(ctx(node, { audio: toneNode, trigger: true }, { mode: 'manual' }))
    await flush()
    speechRecognitionExecutor(ctx(node, { audio: toneNode, trigger: true }, { mode: 'manual' }))
    await flush()

    const out = speechRecognitionExecutor(ctx(node, { audio: toneNode }, { mode: 'manual' })) as Map<string, unknown>
    expect(out.get('error')).toBe('')
    expect(out.get('text')).toBe('transcribed text')
  })
})
