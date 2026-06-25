import type { NodeDefinition } from '../types'

export const textToSpeechNode: NodeDefinition = {
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
