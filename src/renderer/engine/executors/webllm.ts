/**
 * WebLLM node executor — streaming local LLM over WebGPU (llm). The per-node maps
 * auto-clean via defineNodeState; the WebLLM service has its own defineLifecycle
 * cleanup. Extracted from index.ts (Phase 1 de-monolith).
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState, defineLifecycle } from '../nodeState'
import { webLLMService } from '../../services/ai/WebLLMService'
import { DEFAULT_WEBLLM_MODEL } from '../../registry/ai/llm/node'

/**
 * LLM node: stream text from a local WebGPU model via {@link webLLMService}. On a
 * rising `trigger` edge it kicks off generation (fire-and-forget — never awaited,
 * so the render loop isn't blocked) and each frame outputs the current streamed
 * text + status. Without WebGPU the service yields an `unsupported` state and
 * `supported` goes false (a clear, non-throwing capability gate).
 */
export const llmTriggerPrev = defineNodeState<boolean>({ label: 'llm-trigger' })
export const llmPrevStatus = defineNodeState<string>({ label: 'llm-status' })

// The per-node maps above auto-clean via defineNodeState; the WebLLM *service*
// needs its own cleanup (drop per-node generations on removal; stop active
// generations on engine stop — but keep loaded engines, which are user-managed).
defineLifecycle({
  label: 'webllm-service',
  gc: (validNodeIds) => webLLMService.gc(validNodeIds),
  disposeAll: () => webLLMService.stopActive(),
})

export const llmExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const pressed = Boolean(ctx.inputs.get('trigger'))
  const prevPressed = llmTriggerPrev.get(ctx.nodeId) ?? false
  if (pressed && !prevPressed) {
    const prompt = String(ctx.inputs.get('prompt') ?? ctx.controls.get('prompt') ?? '')
    const system = String(ctx.inputs.get('system') ?? ctx.controls.get('system') ?? '')
    const model = (ctx.controls.get('model') as string) || DEFAULT_WEBLLM_MODEL
    const maxTokens = Math.floor((ctx.controls.get('maxTokens') as number) ?? 512)
    const temperature = (ctx.controls.get('temperature') as number) ?? 0.7
    if (prompt) {
      void webLLMService.startGeneration(ctx.nodeId, {
        model,
        prompt,
        system: system || undefined,
        maxTokens,
        temperature,
      })
    }
  }
  llmTriggerPrev.set(ctx.nodeId, pressed)

  const state = webLLMService.getState(ctx.nodeId)
  const prevStatus = llmPrevStatus.get(ctx.nodeId)
  llmPrevStatus.set(ctx.nodeId, state.status)

  return new Map<string, unknown>([
    ['text', state.text],
    ['generating', state.status === 'loading' || state.status === 'generating'],
    // Fire `done` for a single frame on the transition into the done state.
    ['done', state.status === 'done' && prevStatus !== 'done'],
    ['supported', state.status !== 'unsupported'],
  ])
}
