import type { NodeDefinition } from '../types'

export const imageLoaderNode: NodeDefinition = {
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
}
