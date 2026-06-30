# Model Registry Derive — Decision Memo (`defineModel` step 7) — 2026-06-30

**Status: AWAITING MAINTAINER SIGN-OFF for the derive.** The additive scaffold
(`defineModel` + `modelRegistry` + count/prompt-format gates) is **built and green**
(inert until `*.model.ts` files are authored). This memo pins the *derive* — turning
the three hand-authored catalogs into data derived from `modelSpecs` — which has real
forks the deep-equal gate makes unforgiving. Grounded in the actual catalogs
(`AIInference.ts:77` `AI_MODELS`, `registry/ai/llm.ts:11` `WEBLLM_MODELS`,
`MediaPipeService.ts:329` MediaPipe URLs). EXTENSIBILITY §8; POLICIES §1.

---

## The mismatch (why this isn't 1:1 like protocols)

`defineModel` is **per-model**. The catalogs are not:
- **`AI_MODELS`** is **per-task**: each entry has task-level `name`/`description`/
  `category`/`supportsWebGPU` + a `defaultModel` (+ `defaultSize`/`defaultLicense`) +
  an *ordered* `alternateModels[]`. ~10 tasks, ~40 models.
- **`WEBLLM_MODELS`** is a flat ordered `as const` array (id/name/size); `DEFAULT_WEBLLM_MODEL = WEBLLM_MODELS[0]` — **order is meaningful** (default = first; the list is small→large/grouped).
- **MediaPipe** is **not an id catalog at all** — WASM CDN URLs + a `MODEL_BASE`,
  with model URLs constructed per task (hand/face/pose/object/gesture/segment/audio).

So a per-model glob must *reconstruct* per-task structure, ordering, and default
selection exactly — that's the design fork.

## Decisions needed (each shapes the derive + the gate)

1. **Where does per-task wrapper metadata live?** (task `name`/`description`/`category`)
   - **(a)** Small hand-authored `taskCatalog` (per-task display metadata) + per-model
     `.model.ts`; derive groups specs by task and attaches the wrapper. *(Recommended —
     clean separation; task copy is editorial, not per-model.)*
   - (b) Mark one model per task as default and have it carry the task metadata. (Couples
     editorial copy to a model; brittle.)
   - (c) Keep `AI_MODELS` task entries hand-authored; derive only the `alternateModels[]`
     lists from specs. (Lowest-risk for deep-equal, smallest win.)

2. **Default + ordering.** Deep-equal demands exact `defaultModel` + `alternateModels`
   order + `WEBLLM_MODELS` order. Add `default?: boolean` + `order?: number` to
   `ModelSpec`, or derive order from an explicit per-task/per-family list? *(Recommend an
   explicit order list per task/family — glob sort won't reproduce the curated order.)*

3. **MediaPipe scope.** It's the weakest fit (URL-built, stable). Options: bring it under
   `defineModel` (family `mediapipe`, id → `MODEL_BASE` URL) for uniformity, or **leave
   MediaPipe hand-authored for now** and derive only transformers + webllm. *(Recommend
   defer MediaPipe — low value, high fiddle.)*

4. **Auto loading/progress/error outputs (the dead-`_error` fix).** §8's bigger payoff:
   a `defineNode({ models:[{task}] })` post-process auto-appends `loading`/`progress`/
   `done`/`error` outputs + a `model` select, and a shared `runModelInference()` latches
   the error into the real `error` output (audit §G — `_error` is set but read nowhere).
   This touches `defineNode` post-processing + the AI executors + the per-node error
   badge. **Separate sub-step or same PR?** *(Recommend separate — it's independent of the
   catalog derive and is the higher-value half.)*

5. **First derive PR.** `WEBLLM_MODELS` (one flat array, simplest deep-equal) or
   transformers `AI_MODELS` first? *(Recommend webllm first to prove the pattern.)*

## Invariants (unchanged regardless of the above)

- `.model.ts` is metadata-only — never statically imports transformers.js / web-llm /
  MediaPipe runtime (keeps the glob light; the registry test eager-imports it).
- Worker contract (`ai.worker.ts` `{type,task,model,method,args}`, `${task}:${model}`
  keying) + `modelStorage` cache untouched.
- `textGenFormat.isChatModel` moves onto `spec.load.promptFormat` (the prompt-format gate,
  already scaffolded) — but keep `isChatModel` as the fallback until every text-gen model
  is co-located.
- Gate: derived `AI_MODELS`/`WEBLLM_MODELS` **deep-equal** today's (POLICIES); tighten the
  scaffold's count guard to set-equality then.
