/**
 * Dedicated worker hosting the WebLLM engine so WebGPU inference runs off the main
 * thread. The main thread connects via `CreateWebWorkerMLCEngine`; this file just
 * forwards messages to WebLLM's handler. Browser-only — instantiated through
 * `new Worker(new URL('./webllm.worker.ts', import.meta.url))` in WebLLMService.
 */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

const handler = new WebWorkerMLCEngineHandler()
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg)
}
