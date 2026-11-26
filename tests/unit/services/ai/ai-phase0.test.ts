import { describe, it, expect, afterEach } from 'vitest'
import { AI_MODELS, aiInference, getModelSelectOptions } from '@/services/ai/AIInference'
import speechRecognitionSpec from '@/registry/ai/speech-recognition/node'
import depthEstimationSpec from '@/registry/ai/depth-estimation/node'
import { DEFAULT_YOLO_URL } from '@/registry/ai/shared'
import yoloSpec from '@/registry/ai/object-detection-yolo/node'

/**
 * AI models plan, Phase 0 (docs/plans/AI_MODELS_PLAN_2026-11.md): the fixes to what was broken.
 */
describe('AI models: Phase 0 fixes', () => {
  afterEach(() => {
    for (const m of AI_MODELS) aiInference.setSelectedModel(m.id, m.defaultModel)
  })

  it('captions with SmolVLM; the dead BLIP models are gone from the catalog', () => {
    const caption = AI_MODELS.find((m) => m.task === 'image-to-text')!
    expect(caption.defaultModel).toBe('HuggingFaceTB/SmolVLM-256M-Instruct')
    const all = AI_MODELS.flatMap((m) => [m.defaultModel, ...m.alternateModels.map((a) => a.id)])
    expect(all.some((id) => /blip/i.test(id))).toBe(false)
  })

  it('"Default" follows the model picked in the AI Models manager (keyed by catalog entry id)', () => {
    // VLA's entry id ('vision-language') differs from its task ('image-text-to-text').
    expect(aiInference.getDefaultModel('image-text-to-text')).toBe('HuggingFaceTB/SmolVLM-256M-Instruct')
    aiInference.setSelectedModel('vision-language', 'HuggingFaceTB/SmolVLM-500M-Instruct')
    expect(aiInference.getDefaultModel('image-text-to-text')).toBe('HuggingFaceTB/SmolVLM-500M-Instruct')
    // A pick that isn't offered for the task falls back to the catalog default.
    aiInference.setSelectedModel('vision-language', 'someone/not-in-catalog')
    expect(aiInference.getDefaultModel('image-text-to-text')).toBe('HuggingFaceTB/SmolVLM-256M-Instruct')
    expect(getModelSelectOptions('image-text-to-text')[0].label).toMatch(/^Default — SmolVLM-256M/)
  })

  it('depth and the live detectors are catalog models', () => {
    const depth = AI_MODELS.find((m) => m.task === 'depth-estimation')!
    expect(depth.defaultModel).toBe('onnx-community/depth-anything-v2-small')
    const detect = AI_MODELS.find((m) => m.task === 'object-detection')!
    expect(detect.alternateModels.map((a) => a.id)).toEqual(expect.arrayContaining(['onnx-community/dfine_s_coco-ONNX', 'onnx-community/rtdetr_v2_r18vd-ONNX']))
    const select = depthEstimationSpec.definition.controls.find((c) => c.id === 'model')
    expect(select?.default).toBe('')
  })

  it('Speech Recognition has a model select (it read one it never declared)', () => {
    const select = speechRecognitionSpec.definition.controls.find((c) => c.id === 'model')
    expect(select?.type).toBe('select')
    const values = (select?.props as { options: Array<{ value: string }> }).options.map((o) => o.value)
    expect(values).toContain('')
    expect(values.length).toBeGreaterThan(1)
  })

  it('the YOLO fallback is the same model as the control default', () => {
    const control = yoloSpec.definition.controls.find((c) => c.id === 'modelUrl')
    expect(control?.default).toBe(DEFAULT_YOLO_URL)
  })
})
