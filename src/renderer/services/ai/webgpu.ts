import { probe } from '@hackbuild/ai-env'

/**
 * WebGPU capability detection. WebLLM (and the future TSL/WebGPU renderer) need a real GPU
 * adapter, not just the `navigator.gpu` namespace. Uses the same probe as model fit
 * (`@hackbuild/ai-env`), so the app has one answer to "is there a GPU". Never throws.
 */
export async function isWebGPUAvailable(): Promise<boolean> {
  try {
    return (await probe()).webgpu
  } catch {
    return false
  }
}
