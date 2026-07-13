import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { videoPlayerState } from '../shared'

const definition: NodeDefinition = {
  id: 'video-player',
  name: 'Video Player',
  version: '1.0.0',
  category: 'visual',
  description: 'Play video from URL or file',
  icon: 'play-circle',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'url', type: 'string', label: 'URL' },
    { id: 'play', type: 'trigger', label: 'Play' },
    { id: 'pause', type: 'trigger', label: 'Pause' },
    { id: 'seek', type: 'number', label: 'Seek (s)' },
  ],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'video', type: 'video', label: 'Video Element' },
    { id: 'playing', type: 'boolean', label: 'Playing' },
    { id: 'time', type: 'number', label: 'Current Time' },
    { id: 'duration', type: 'number', label: 'Duration' },
    { id: 'progress', type: 'number', label: 'Progress (0-1)' },
  ],
  controls: [
    { id: 'url', type: 'text', label: 'Video URL', default: '' },
    { id: 'autoplay', type: 'toggle', label: 'Autoplay', default: false },
    { id: 'loop', type: 'toggle', label: 'Loop', default: true },
    {
      id: 'playbackRate',
      type: 'number',
      label: 'Playback Rate',
      default: 1,
      props: { min: 0.25, max: 4, step: 0.25 },
    },
    {
      id: 'volume',
      type: 'slider',
      label: 'Volume',
      default: 0.5,
      props: { min: 0, max: 1, step: 0.01 },
    },
  ],
  tags: ['video', 'player', 'movie', 'clip', 'footage', 'playback', 'source', 'file'],
  info: {
    overview: 'Plays a video file from a URL and outputs its frames as a texture. Provides playback controls including play, pause, seek, loop, and playback rate. Also outputs current time, duration, and a normalized progress value.',
    tips: [
      'Use the progress output (0 to 1) with map-range to sync other parameters to the video timeline.',
      'Set loop to true and connect a metronome to the seek input to create rhythmic video scrubbing.',
      'The video element output can be shared with other nodes that accept raw video for additional processing.',
    ],
    pairsWith: ['blend', 'shader', 'color-correction', 'metronome', 'texture-display'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const urlInput = ctx.inputs.get('url') as string | undefined
  const urlControl = ctx.controls.get('url') as string
  const url = urlInput ?? urlControl ?? ''

  const playTrigger = ctx.inputs.get('play')
  const pauseTrigger = ctx.inputs.get('pause')
  const seekInput = ctx.inputs.get('seek') as number | undefined

  const autoplay = (ctx.controls.get('autoplay') as boolean) ?? false
  const loop = (ctx.controls.get('loop') as boolean) ?? true
  const playbackRate = (ctx.controls.get('playbackRate') as number) ?? 1
  const volume = (ctx.controls.get('volume') as number) ?? 0.5

  const outputs = new Map<string, unknown>()

  // Initialize state for this node
  let state = videoPlayerState.get(ctx.nodeId)
  if (!state) {
    state = { video: null, texture: null, loadedUrl: null, lastSeek: null }
    videoPlayerState.set(ctx.nodeId, state)
  }

  if (!url) {
    outputs.set('texture', null)
    outputs.set('video', null)
    outputs.set('playing', false)
    outputs.set('time', 0)
    outputs.set('duration', 0)
    outputs.set('progress', 0)
    return outputs
  }

  // Check if URL changed
  const urlChanged = url !== state.loadedUrl

  // Create or update video element
  if (urlChanged || !state.video) {
    if (state.video) {
      state.video.pause()
      state.video.src = ''
    }

    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = volume === 0
    video.loop = loop
    video.playbackRate = playbackRate
    video.volume = volume
    video.playsInline = true
    video.src = url

    if (autoplay) {
      video.play().catch(() => {
        // Autoplay may be blocked by browser
      })
    }

    state.video = video
    state.loadedUrl = url
    state.texture = null
  }

  const video = state.video!

  // Update video properties
  if (video.loop !== loop) video.loop = loop
  if (Math.abs(video.playbackRate - playbackRate) > 0.01) video.playbackRate = playbackRate
  if (Math.abs(video.volume - volume) > 0.01) video.volume = volume
  video.muted = volume === 0

  // Handle play/pause triggers
  const hasPlayTrigger = playTrigger === true || playTrigger === 1 || (typeof playTrigger === 'number' && playTrigger > 0)
  const hasPauseTrigger = pauseTrigger === true || pauseTrigger === 1 || (typeof pauseTrigger === 'number' && pauseTrigger > 0)

  if (hasPlayTrigger && video.paused) {
    video.play().catch(() => {})
  }
  if (hasPauseTrigger && !video.paused) {
    video.pause()
  }

  // Handle seek
  if (seekInput !== undefined && seekInput !== state.lastSeek) {
    if (video.readyState >= 1) {
      video.currentTime = Math.max(0, Math.min(seekInput, video.duration || 0))
    }
    state.lastSeek = seekInput
  }

  // Update texture from video frame
  if (video.readyState >= 2 && video.videoWidth > 0) {
    const renderer = getThreeShaderRenderer()
    if (!state.texture) {
      state.texture = renderer.createTexture(video)
    } else {
      renderer.updateTexture(state.texture, video)
    }
  }

  outputs.set('texture', state.texture)
  outputs.set('video', video)
  outputs.set('playing', !video.paused)
  outputs.set('time', video.currentTime || 0)
  outputs.set('duration', video.duration || 0)
  outputs.set('progress', video.duration ? video.currentTime / video.duration : 0)

  return outputs
}

export default defineNode({ definition, executor })
