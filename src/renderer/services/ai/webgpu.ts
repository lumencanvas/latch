/**
 * WebGPU capability detection. WebLLM (and the future TSL/WebGPU renderer) need a
 * real GPU adapter, not just the `navigator.gpu` namespace — request one and see.
 * Never throws; returns false on any error or in non-browser/worker contexts.
 */
export async function isWebGPUAvailable(): Promise<boolean> {
  try {
    const gpu = (globalThis.navigator as Navigator | undefined)?.gpu
    if (!gpu) return false
    const adapter = await gpu.requestAdapter()
    return !!adapter
  } catch {
    return false
  }
}
