# AI Web Workers Implementation Plan

## Problem
Transformers.js runs heavy ML inference on the main thread, causing UI freezes even with async code. This blocks the execution engine and makes the app unresponsive during AI operations.

## Solution
Move AI inference to a dedicated Web Worker. The main thread sends inference requests to the worker, which processes them in the background and returns results.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MAIN THREAD                               │
│                                                                  │
│  ┌──────────────┐    ┌─────────────────┐    ┌────────────────┐  │
│  │ AI Executors │───▶│ AIWorkerBridge  │───▶│ Worker Manager │  │
│  └──────────────┘    └─────────────────┘    └───────┬────────┘  │
│                                                      │           │
└──────────────────────────────────────────────────────┼───────────┘
                                                       │ postMessage
                                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                        WEB WORKER                                │
│                                                                  │
│  ┌──────────────────┐    ┌─────────────────────────────────┐    │
│  │ Message Handler  │───▶│ AIInferenceWorker               │    │
│  │ (onmessage)      │    │ - Model loading                 │    │
│  └──────────────────┘    │ - Text generation               │    │
│                          │ - Image classification          │    │
│                          │ - Sentiment analysis            │    │
│                          │ - etc.                          │    │
│                          └─────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Worker Infrastructure

#### 1.1 Create AI Worker Script
**File**: `src/renderer/workers/ai.worker.ts`

```typescript
// Message types
interface WorkerRequest {
  id: string
  type: 'load-model' | 'generate-text' | 'classify-image' | 'analyze-sentiment' | ...
  payload: Record<string, unknown>
}

interface WorkerResponse {
  id: string
  type: 'success' | 'error' | 'progress'
  payload: unknown
}

// Worker code
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true

const pipelines = new Map<string, any>()

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data

  try {
    switch (type) {
      case 'load-model':
        await handleLoadModel(id, payload)
        break
      case 'generate-text':
        await handleTextGeneration(id, payload)
        break
      // ... other handlers
    }
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      payload: { message: error.message }
    })
  }
}

async function handleLoadModel(id: string, payload: any) {
  const { task, modelId, options } = payload
  const key = `${task}:${modelId}`

  const pipe = await pipeline(task, modelId, {
    progress_callback: (progress) => {
      self.postMessage({
        id,
        type: 'progress',
        payload: progress
      })
    },
    ...options
  })

  pipelines.set(key, pipe)

  self.postMessage({
    id,
    type: 'success',
    payload: { loaded: true }
  })
}

async function handleTextGeneration(id: string, payload: any) {
  const { task, modelId, prompt, options } = payload
  const key = `${task}:${modelId}`
  const pipe = pipelines.get(key)

  if (!pipe) {
    throw new Error('Model not loaded')
  }

  const result = await pipe(prompt, options)

  self.postMessage({
    id,
    type: 'success',
    payload: { text: result[0]?.generated_text ?? '' }
  })
}
```

#### 1.2 Create Worker Bridge
**File**: `src/renderer/services/ai/AIWorkerBridge.ts`

```typescript
type PendingRequest = {
  resolve: (value: any) => void
  reject: (error: Error) => void
  onProgress?: (progress: number) => void
}

class AIWorkerBridge {
  private worker: Worker | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private requestId = 0

  constructor() {
    this.initWorker()
  }

  private initWorker() {
    this.worker = new Worker(
      new URL('../workers/ai.worker.ts', import.meta.url),
      { type: 'module' }
    )

    this.worker.onmessage = (event) => {
      const { id, type, payload } = event.data
      const pending = this.pendingRequests.get(id)

      if (!pending) return

      if (type === 'success') {
        pending.resolve(payload)
        this.pendingRequests.delete(id)
      } else if (type === 'error') {
        pending.reject(new Error(payload.message))
        this.pendingRequests.delete(id)
      } else if (type === 'progress') {
        pending.onProgress?.(payload)
      }
    }
  }

  async request(
    type: string,
    payload: Record<string, unknown>,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    const id = `req_${++this.requestId}`

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onProgress })
      this.worker?.postMessage({ id, type, payload })
    })
  }

  // Convenience methods
  async loadModel(task: string, modelId: string, options?: any, onProgress?: (p: number) => void) {
    return this.request('load-model', { task, modelId, options }, onProgress)
  }

  async generateText(prompt: string, options: any, modelId?: string) {
    return this.request('generate-text', {
      task: 'text-generation',
      modelId: modelId ?? 'default',
      prompt,
      options
    })
  }

  // ... other methods

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.pendingRequests.clear()
  }
}

export const aiWorkerBridge = new AIWorkerBridge()
```

### Phase 2: Update AI Inference Service

#### 2.1 Modify AIInference.ts to use Worker
**File**: `src/renderer/services/ai/AIInference.ts`

- Replace direct Transformers.js calls with worker bridge calls
- Keep the same public API for backward compatibility
- Progress callbacks work via worker messages

### Phase 3: Update AI Executors

#### 3.1 Simplify Executors
The executors become much simpler since they just call the bridge:

```typescript
export const textGenerationExecutor: NodeExecutorFn = (ctx) => {
  const outputs = new Map<string, unknown>()
  const trigger = ctx.inputs.get('trigger')

  if (trigger !== true && trigger !== 1) {
    outputs.set('text', getCached(`${ctx.nodeId}:lastOutput`, ''))
    outputs.set('loading', getCached(`${ctx.nodeId}:loading`, false))
    return outputs
  }

  if (pendingOperations.has(ctx.nodeId)) {
    outputs.set('text', getCached(`${ctx.nodeId}:lastOutput`, ''))
    outputs.set('loading', true)
    return outputs
  }

  const prompt = ctx.inputs.get('prompt') as string ?? ''

  // Fire and forget - worker handles everything in background
  setCached(`${ctx.nodeId}:loading`, true)

  aiWorkerBridge.generateText(prompt, { maxLength: 50 })
    .then(result => {
      setCached(`${ctx.nodeId}:lastOutput`, result.text)
      setCached(`${ctx.nodeId}:loading`, false)
      pendingOperations.delete(ctx.nodeId)
    })
    .catch(() => {
      setCached(`${ctx.nodeId}:loading`, false)
      pendingOperations.delete(ctx.nodeId)
    })

  pendingOperations.set(ctx.nodeId, true)

  outputs.set('text', getCached(`${ctx.nodeId}:lastOutput`, ''))
  outputs.set('loading', true)
  return outputs
}
```

### Phase 4: Vite Configuration

#### 4.1 Update vite.config.ts for Workers
```typescript
// vite.config.ts
export default defineConfig({
  // ... existing config
  worker: {
    format: 'es',
    plugins: () => [/* any plugins needed for workers */]
  }
})
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/renderer/workers/ai.worker.ts` | NEW - Worker script with inference logic |
| `src/renderer/services/ai/AIWorkerBridge.ts` | NEW - Bridge between main thread and worker |
| `src/renderer/services/ai/AIInference.ts` | UPDATE - Use worker bridge instead of direct calls |
| `src/renderer/engine/executors/ai.ts` | UPDATE - Simplify to use async worker bridge |
| `vite.config.ts` | UPDATE - Add worker configuration |
| `tsconfig.json` | UPDATE - Add WebWorker lib if needed |

---

## Handling Image Data

For image-based AI (classification, detection, captioning), we need to transfer image data to the worker:

```typescript
// In executor - convert canvas to ImageData
const canvas = imageInput as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

// Transfer the ArrayBuffer for efficiency (zero-copy)
aiWorkerBridge.classifyImage(imageData, { topK: 5 })
  .then(result => { ... })

// In bridge - use transferable objects
this.worker?.postMessage(
  { id, type, payload: { imageData, options } },
  [imageData.data.buffer]  // Transfer, don't copy
)
```

---

## Progress Tracking

The Model Manager modal will continue to work since we pass progress callbacks:

```typescript
await aiWorkerBridge.loadModel(
  'text-generation',
  'Xenova/gpt2',
  { dtype: 'q4' },
  (progress) => {
    updateModelInfo(key, { progress })
  }
)
```

---

## Testing Checklist

- [ ] Worker loads and initializes correctly
- [ ] Model loading works with progress tracking
- [ ] Text generation doesn't freeze UI
- [ ] Image classification doesn't freeze UI
- [ ] Multiple concurrent requests work correctly
- [ ] Worker error handling works
- [ ] Worker disposal/cleanup works
- [ ] Electron build includes worker files correctly

---

## Estimated Effort

| Phase | Description | Estimate |
|-------|-------------|----------|
| 1 | Worker infrastructure | Medium |
| 2 | Update AIInference | Small |
| 3 | Update executors | Small |
| 4 | Vite config | Small |
| 5 | Testing | Medium |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Worker bundling issues | Test in both dev and production builds |
| Image transfer performance | Use transferable objects, avoid copies |
| Electron worker support | Test early, may need different worker setup |
| Memory leaks | Ensure proper cleanup on component unmount |
