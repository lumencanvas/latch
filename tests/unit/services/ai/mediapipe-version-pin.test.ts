/**
 * The MediaPipe WASM is fetched from the CDN while the JS glue is bundled from node_modules —
 * they must be the SAME release. `@latest` served a newer WASM to the 0.10.x JS. Pin + guard.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MEDIAPIPE_VISION_VERSION, MEDIAPIPE_AUDIO_VERSION } from '@/services/ai/MediaPipeService'

const installed = (pkg: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../../../../node_modules/@mediapipe/${pkg}/package.json`), 'utf8')).version

describe('MediaPipe WASM version pin', () => {
  it('matches the installed @mediapipe/tasks-vision / tasks-audio packages', () => {
    expect(MEDIAPIPE_VISION_VERSION).toBe(installed('tasks-vision'))
    expect(MEDIAPIPE_AUDIO_VERSION).toBe(installed('tasks-audio'))
  })

  it('never loads WASM from @latest', () => {
    const src = readFileSync(resolve(__dirname, '../../../../src/renderer/services/ai/MediaPipeService.ts'), 'utf8')
    expect(src).not.toMatch(/tasks-(vision|audio)@latest/)
  })
})
