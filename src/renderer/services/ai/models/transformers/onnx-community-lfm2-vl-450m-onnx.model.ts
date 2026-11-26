import { defineModel } from '../../defineModel'

// GPU only (hackbuild measured LFM2-VL on WebGPU; no CPU rung). Sizes from the repo's q4f16 files.
// The LFM Open License limits commercial use by revenue: LATCH shows a badge.
export default defineModel({
  id: 'onnx-community/LFM2-VL-450M-ONNX',
  name: 'LFM2-VL 450M (GPU, fast)',
  family: 'transformers',
  task: 'image-text-to-text',
  size: '~320 MB',
  sizeMB: 316,
  sizeSource: 'vendor',
  license: 'lfm1.0',
  ladder: [
    { device: 'webgpu', dtype: 'q4f16' },
    { device: 'webgpu', dtype: 'q4' },
  ],
})
