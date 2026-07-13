import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { assetStorageManager } from '@/services/assets/AssetStorage'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { imageLoaderState, pendingAssetLoads } from '../shared'

const definition: NodeDefinition = {
  id: 'image-loader',
  name: 'Image Loader',
  version: '1.1.0',
  category: 'visual',
  description: 'Load images from URL, file, or asset library',
  icon: 'image',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'url', type: 'string', label: 'URL' },
    { id: 'trigger', type: 'trigger', label: 'Reload' },
  ],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    {
      id: 'assetId',
      type: 'asset-picker',
      label: 'Asset',
      default: null,
      props: { assetType: 'image' },
    },
    { id: 'url', type: 'text', label: 'Or URL', default: '' },
    {
      id: 'crossOrigin',
      type: 'select',
      label: 'Cross Origin',
      default: 'anonymous',
      props: { options: ['anonymous', 'use-credentials', 'none'] },
    },
  ],
  tags: ['image', 'picture', 'photo', 'load', 'file', 'texture', 'source', 'still'],
  info: {
    overview: 'Loads a still image from a URL, local file, or the built-in asset library and outputs it as a texture. Also provides the image dimensions and a loading state. Supports reload via trigger input.',
    tips: [
      'Use the reload trigger input to swap images at runtime without rebuilding connections.',
      'Set cross-origin to none when loading local files to avoid unnecessary CORS restrictions.',
      'The loading output can gate downstream nodes so they only process after the image is ready.',
    ],
    pairsWith: ['blend', 'shader', 'displacement', 'color-correction', 'start'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const urlInput = ctx.inputs.get('url') as string | undefined
  const urlControl = ctx.controls.get('url') as string
  const assetId = ctx.controls.get('assetId') as string | null
  const trigger = ctx.inputs.get('trigger')
  const crossOrigin = (ctx.controls.get('crossOrigin') as string) ?? 'anonymous'

  const outputs = new Map<string, unknown>()

  // Initialize state for this node
  let state = imageLoaderState.get(ctx.nodeId)
  if (!state) {
    state = { image: null, texture: null, loading: false, loadedUrl: null, error: null }
    imageLoaderState.set(ctx.nodeId, state)
  }

  // Determine the URL to use: asset takes priority over URL input
  let url = ''
  const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)

  // If assetId is set, resolve it to a URL
  if (assetId) {
    const assetUrlKey = `asset:${assetId}`

    // Check if we've already loaded this asset
    if (state.loadedUrl === assetUrlKey && state.texture && !hasTrigger) {
      outputs.set('texture', state.texture)
      outputs.set('width', state.image?.naturalWidth ?? 0)
      outputs.set('height', state.image?.naturalHeight ?? 0)
      outputs.set('loading', state.loading)
      return outputs
    }

    // Start loading asset URL if not already pending
    if (!pendingAssetLoads.has(ctx.nodeId) && (!state.loadedUrl?.startsWith('asset:') || hasTrigger)) {
      state.loading = true
      state.error = null

      const loadPromise = (async () => {
        try {
          const assetUrl = await assetStorageManager.getAssetUrl(assetId)
          if (assetUrl) {
            // Load the image from the asset URL
            const img = new Image()
            img.crossOrigin = 'anonymous'

            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve()
              img.onerror = () => reject(new Error('Failed to load asset image'))
              img.src = assetUrl
            })

            const renderer = getThreeShaderRenderer()
            if (state!.texture) {
              state!.texture.dispose()
            }
            state!.texture = renderer.createTexture(img)
            state!.image = img
            state!.loadedUrl = assetUrlKey
            state!.loading = false
          } else {
            state!.error = 'Asset not found'
            state!.loading = false
            // Latch the gate so a missing asset doesn't re-fire getAssetUrl every
            // frame; a Trigger still forces a retry. (Matches the URL branch.)
            state!.loadedUrl = assetUrlKey
          }
        } catch (error) {
          state!.error = error instanceof Error ? error.message : 'Failed to load asset'
          state!.loading = false
          state!.loadedUrl = assetUrlKey
        } finally {
          pendingAssetLoads.delete(ctx.nodeId)
        }
      })()

      pendingAssetLoads.set(ctx.nodeId, loadPromise)
    }

    outputs.set('texture', state.texture)
    outputs.set('width', state.image?.naturalWidth ?? 0)
    outputs.set('height', state.image?.naturalHeight ?? 0)
    outputs.set('loading', state.loading)
    if (state.error) {
      outputs.set('_error', state.error)
    }
    return outputs
  }

  // Fall back to URL input/control
  url = urlInput ?? urlControl ?? ''

  if (!url) {
    outputs.set('texture', null)
    outputs.set('width', 0)
    outputs.set('height', 0)
    outputs.set('loading', false)
    return outputs
  }

  // Check if URL changed or trigger was fired
  const urlChanged = url !== state.loadedUrl

  // Start loading if needed
  if ((urlChanged || hasTrigger) && !state.loading) {
    state.loading = true
    state.loadedUrl = url
    state.error = null

    const img = new Image()
    if (crossOrigin !== 'none') {
      img.crossOrigin = crossOrigin
    }

    img.onload = () => {
      const renderer = getThreeShaderRenderer()
      // Dispose old texture if exists
      if (state!.texture) {
        state!.texture.dispose()
      }
      // Create texture from image
      const texture = renderer.createTexture(img)
      state!.image = img
      state!.texture = texture
      state!.loading = false
    }

    img.onerror = () => {
      state!.loading = false
      state!.error = 'Failed to load image'
      state!.image = null
      state!.texture = null
    }

    img.src = url
  }

  outputs.set('texture', state.texture)
  outputs.set('width', state.image?.naturalWidth ?? 0)
  outputs.set('height', state.image?.naturalHeight ?? 0)
  outputs.set('loading', state.loading)
  if (state.error) {
    outputs.set('_error', state.error)
  }

  return outputs
}

export default defineNode({ definition, executor })
