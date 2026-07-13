import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import * as Tone from 'tone'
import { audioNodes, playerState } from '../shared'

const definition: NodeDefinition = {
  id: 'audio-player',
  name: 'Audio Player',
  version: '1.0.0',
  category: 'audio',
  description: 'Play audio files from URL',
  icon: 'play-circle',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'url', type: 'string', label: 'URL' },
    { id: 'play', type: 'trigger', label: 'Play' },
    { id: 'stop', type: 'trigger', label: 'Stop' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'playing', type: 'boolean', label: 'Playing' },
    { id: 'duration', type: 'number', label: 'Duration' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'url', type: 'text', label: 'URL', default: '' },
    { id: 'loop', type: 'toggle', label: 'Loop', default: false },
    { id: 'autoplay', type: 'toggle', label: 'Autoplay', default: false },
    { id: 'volume', type: 'slider', label: 'Volume (dB)', default: 0, props: { min: -40, max: 6, step: 1 } },
    { id: 'playbackRate', type: 'slider', label: 'Speed', default: 1, props: { min: 0.5, max: 2, step: 0.1 } },
  ],
  info: {
    overview: 'Loads and plays audio files from a URL. Supports looping, autoplay, volume, and playback speed controls. Outputs the audio signal along with playback state information like duration and loading status.',
    tips: [
      'Enable loop for continuous background music or ambient sound beds.',
      'Use the playing and duration outputs to synchronize other nodes with the audio timeline.',
      'Check the error output to detect broken URLs or unsupported formats.',
    ],
    pairsWith: ['audio-output', 'gain', 'audio-analyzer', 'reverb', 'beat-detect'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const url = (ctx.inputs.get('url') as string) ?? (ctx.controls.get('url') as string) ?? ''
  const play = ctx.inputs.get('play') as boolean | undefined
  const stop = ctx.inputs.get('stop') as boolean | undefined
  const loop = (ctx.controls.get('loop') as boolean) ?? false
  const volume = (ctx.controls.get('volume') as number) ?? 0 // dB
  const playbackRate = (ctx.controls.get('playbackRate') as number) ?? 1
  const autoplay = (ctx.controls.get('autoplay') as boolean) ?? false

  // Initialize state
  if (!playerState.has(ctx.nodeId)) {
    playerState.set(ctx.nodeId, {
      url: '',
      player: null,
      loading: false,
      error: null,
    })
  }

  const state = playerState.get(ctx.nodeId)!

  // Check if existing player was disposed (e.g., after stop/restart)
  if (state.player && (state.player as unknown as { disposed?: boolean }).disposed) {
    state.player = null
    state.url = '' // Force reload on next iteration
    audioNodes.delete(ctx.nodeId)
  }

  // Handle URL change - load new audio
  if (url && url !== state.url) {
    state.url = url
    state.loading = true
    state.error = null

    // Dispose old player
    if (state.player) {
      state.player.dispose()
      audioNodes.delete(ctx.nodeId)
    }

    try {
      const player = new Tone.Player({
        url,
        loop,
        volume,
        playbackRate,
        autostart: autoplay,
        onload: () => {
          state.loading = false
        },
        onerror: (err) => {
          state.error = err?.message ?? 'Failed to load audio'
          state.loading = false
          // Clear player reference on error - it's in an invalid state
          if (state.player === player) {
            state.player = null
            audioNodes.delete(ctx.nodeId)
            try { player.dispose() } catch { /* ignore */ }
          }
        },
      })

      state.player = player
      audioNodes.set(ctx.nodeId, player)
    } catch (err) {
      state.error = err instanceof Error ? err.message : 'Failed to load audio'
      state.loading = false
      // Ensure player is null on synchronous failure
      state.player = null
      audioNodes.delete(ctx.nodeId)
    }
  }

  const player = state.player

  if (player) {
    // Update parameters
    player.loop = loop
    player.volume.value = volume
    player.playbackRate = playbackRate

    // Handle play/stop triggers
    if (play && player.loaded && player.state !== 'started') {
      player.start()
    }

    if (stop && player.state === 'started') {
      player.stop()
    }
  }

  const outputs = new Map<string, unknown>()
  outputs.set('audio', player)
  outputs.set('playing', player?.state === 'started')
  outputs.set('duration', player?.buffer?.duration ?? 0)
  outputs.set('loading', state.loading)
  outputs.set('error', state.error)
  return outputs
}

export default defineNode({ definition, executor })
