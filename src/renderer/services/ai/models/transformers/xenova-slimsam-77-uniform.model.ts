import { defineModel } from '../../defineModel'

// SlimSAM: segment-anything from point prompts. fp32 is ~40 MB (encoder 23 + decoder 17), fp16 ~21 MB.
export default defineModel({
  id: 'Xenova/slimsam-77-uniform',
  name: 'SlimSAM 77 (point prompts)',
  family: 'transformers',
  task: 'mask-generation',
  size: '~40 MB',
  sizeMB: 40,
  sizeSource: 'vendor',
  license: 'apache-2.0',
  ladder: [
    { device: 'webgpu', dtype: 'fp16' },
    { device: 'webgpu', dtype: 'fp32' },
    { device: 'wasm', dtype: 'fp32' },
  ],
})
