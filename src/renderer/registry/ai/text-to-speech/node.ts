import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { textToSpeechService } from '@/services/ai/TextToSpeechService'
import { isNodeDisposed, hasTriggerValue, ttsState } from '../shared'

const definition: NodeDefinition = {
  id: 'text-to-speech',
  name: 'Text to Speech',
  version: '1.0.0',
  category: 'ai',
  description: 'Speak text aloud with the browser speech synthesizer — offline, no model download.',
  icon: 'volume-2',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'text', type: 'string', label: 'Text' },
    { id: 'trigger', type: 'trigger', label: 'Speak' },
  ],
  outputs: [{ id: 'speaking', type: 'boolean', label: 'Speaking' }],
  controls: [
    { id: 'text', type: 'text', label: 'Text', default: '' },
    { id: 'autoSpeak', type: 'toggle', label: 'Auto Speak', default: false },
    { id: 'voice', type: 'text', label: 'Voice (name match)', default: '' },
    { id: 'rate', type: 'slider', label: 'Rate', default: 1, props: { min: 0.1, max: 2, step: 0.05 } },
    { id: 'pitch', type: 'slider', label: 'Pitch', default: 1, props: { min: 0, max: 2, step: 0.05 } },
    { id: 'volume', type: 'slider', label: 'Volume', default: 1, props: { min: 0, max: 1, step: 0.05 } },
  ],
  tags: ['text to speech', 'tts', 'speech', 'voice', 'synthesis', 'speak', 'ai', 'audio'],
  info: {
    overview:
      'Speaks text aloud using the browser Web Speech API. Runs on the main thread with no model download and works offline. Trigger to speak once, or enable Auto Speak to read the text whenever it changes. Leave Voice empty for the system default, or type part of a voice name to pick one.',
    tips: [
      'Pair with Speech to Text or Text Generate for a full voice loop.',
      'Auto Speak re-reads only when the text actually changes, so it will not repeat every frame.',
      'Some browsers require a user interaction on the page before audio will play.',
    ],
    pairsWith: ['text-generation', 'speech-recognition', 'string-template', 'trigger'],
  },
}

export const textToSpeechExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const text = String(ctx.inputs.get('text') ?? ctx.controls.get('text') ?? '')
  const trigger = ctx.inputs.get('trigger')
  const autoSpeak = (ctx.controls.get('autoSpeak') as boolean) ?? false
  const rate = (ctx.controls.get('rate') as number) ?? 1
  const pitch = (ctx.controls.get('pitch') as number) ?? 1
  const volume = (ctx.controls.get('volume') as number) ?? 1
  const voiceName = (ctx.controls.get('voice') as string) ?? ''

  let state = ttsState.get(ctx.nodeId)
  if (!state) {
    state = { lastText: '', lastTriggerHigh: false, speaking: false, utterance: null }
    ttsState.set(ctx.nodeId, state)
  }

  if (!textToSpeechService.isSupported()) {
    outputs.set('speaking', false)
    outputs.set('_error', 'Text-to-speech is not supported in this browser.')
    return outputs
  }

  // Speak on a rising-edge trigger, or (when Auto Speak) whenever text changes.
  const triggerHigh = hasTriggerValue(trigger)
  const risingTrigger = triggerHigh && !state.lastTriggerHigh
  state.lastTriggerHigh = triggerHigh
  const shouldSpeak =
    text.trim().length > 0 && (risingTrigger || (autoSpeak && text !== state.lastText))

  if (shouldSpeak) {
    textToSpeechService.cancel() // interrupt any in-progress utterance first
    const nodeId = ctx.nodeId
    const clearSpeaking = () => {
      const s = ttsState.get(nodeId)
      if (s && !isNodeDisposed(nodeId)) s.speaking = false
    }
    const utterance = textToSpeechService.speak(text, {
      rate,
      pitch,
      volume,
      voiceName,
      onend: clearSpeaking,
      onerror: clearSpeaking,
    })
    if (utterance) {
      state.speaking = true
      state.utterance = utterance
    }
  }
  state.lastText = text

  outputs.set('speaking', state.speaking)
  return outputs
}

export default defineNode({ definition, executor: textToSpeechExecutor })
