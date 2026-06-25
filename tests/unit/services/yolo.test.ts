import { describe, it, expect } from 'vitest'
import {
  parseYoloOutput,
  parseYolov10Output,
  isYolov10Output,
  nms,
  iou,
  COCO_LABELS,
  type YoloBox,
} from '@/services/ai/yolo'

const LABELS = ['A', 'B']

// Build a channels-major [1, 4+C, N] buffer: data[attr*N + anchor].
function channelsMajor(anchors: Array<[number, number, number, number, ...number[]]>): {
  data: Float32Array
  dims: number[]
} {
  const n = anchors.length
  const attrs = anchors[0].length
  const data = new Float32Array(attrs * n)
  anchors.forEach((a, i) => a.forEach((v, attr) => { data[attr * n + i] = v }))
  return { data, dims: [1, attrs, n] }
}

// Transpose to anchors-major [1, N, 4+C]: data[anchor*attrs + attr].
function anchorsMajor(anchors: Array<[number, number, number, number, ...number[]]>): {
  data: Float32Array
  dims: number[]
} {
  const n = anchors.length
  const attrs = anchors[0].length
  const data = new Float32Array(attrs * n)
  anchors.forEach((a, i) => a.forEach((v, attr) => { data[i * attrs + attr] = v }))
  return { data, dims: [1, n, attrs] }
}

describe('parseYoloOutput', () => {
  it('decodes cxcywh -> xyxy and filters by per-class confidence', () => {
    // anchor0: high-conf class A; anchor1: low-conf -> dropped.
    const { data, dims } = channelsMajor([
      [100, 100, 20, 20, 0.9, 0.1],
      [200, 50, 10, 10, 0.2, 0.05],
    ])
    const r = parseYoloOutput(data, dims, { confThreshold: 0.5, scale: 1, padX: 0, padY: 0, labels: LABELS, numClasses: 2 })
    expect(r).toHaveLength(1)
    expect(r[0].label).toBe('A')
    expect(r[0].score).toBeCloseTo(0.9)
    expect(r[0].box).toEqual({ xmin: 90, ymin: 90, xmax: 110, ymax: 110 })
  })

  it('undoes letterbox scale + padding back to original coords', () => {
    const { data, dims } = channelsMajor([[100, 80, 40, 20, 0.8, 0.0]])
    // scale 0.5, pad (10,20): xmin = (100-20-10)/0.5 = 140, ymin = (80-10-20)/0.5 = 100
    const r = parseYoloOutput(data, dims, { confThreshold: 0.5, scale: 0.5, padX: 10, padY: 20, labels: LABELS, numClasses: 2 })
    expect(r[0].box.xmin).toBeCloseTo(140)
    expect(r[0].box.xmax).toBeCloseTo(220) // (100+20-10)/0.5
    expect(r[0].box.ymin).toBeCloseTo(100)
    expect(r[0].box.ymax).toBeCloseTo(140) // (80+10-20)/0.5
  })

  it('handles the transposed anchors-major layout identically', () => {
    const rows: Array<[number, number, number, number, number, number]> = [[100, 100, 20, 20, 0.9, 0.1]]
    const cm = channelsMajor(rows)
    const am = anchorsMajor(rows)
    const opts = { confThreshold: 0.5, scale: 1, padX: 0, padY: 0, labels: LABELS, numClasses: 2 }
    expect(parseYoloOutput(am.data, am.dims, opts)).toEqual(parseYoloOutput(cm.data, cm.dims, opts))
  })

  it('defaults to COCO labels', () => {
    const { data, dims } = channelsMajor([[10, 10, 4, 4, ...new Array(80).fill(0).map((_, i) => (i === 0 ? 0.7 : 0))] as never])
    const r = parseYoloOutput(data, dims, { confThreshold: 0.5, scale: 1, padX: 0, padY: 0, numClasses: 80 })
    expect(r[0].label).toBe(COCO_LABELS[0]) // 'person'
  })
})

describe('iou', () => {
  it('is 1 for identical boxes and 0 for disjoint', () => {
    const a = { xmin: 0, ymin: 0, xmax: 10, ymax: 10 }
    expect(iou(a, a)).toBeCloseTo(1)
    expect(iou(a, { xmin: 20, ymin: 20, xmax: 30, ymax: 30 })).toBe(0)
  })
  it('computes partial overlap', () => {
    // 10x10 boxes overlapping in a 5x5 corner: inter=25, union=175 -> 1/7.
    const a = { xmin: 0, ymin: 0, xmax: 10, ymax: 10 }
    const b = { xmin: 5, ymin: 5, xmax: 15, ymax: 15 }
    expect(iou(a, b)).toBeCloseTo(25 / 175)
  })
})

describe('nms', () => {
  const box = (xmin: number, ymin: number, xmax: number, ymax: number): YoloBox['box'] => ({ xmin, ymin, xmax, ymax })

  it('suppresses lower-scoring overlaps of the same class', () => {
    const boxes: YoloBox[] = [
      { label: 'A', score: 0.9, box: box(0, 0, 10, 10) },
      { label: 'A', score: 0.8, box: box(1, 1, 11, 11) }, // heavy overlap -> suppressed
    ]
    const r = nms(boxes, 0.45)
    expect(r).toHaveLength(1)
    expect(r[0].score).toBeCloseTo(0.9)
  })

  it('keeps non-overlapping boxes', () => {
    const boxes: YoloBox[] = [
      { label: 'A', score: 0.9, box: box(0, 0, 10, 10) },
      { label: 'A', score: 0.8, box: box(50, 50, 60, 60) },
    ]
    expect(nms(boxes, 0.45)).toHaveLength(2)
  })

  it('never suppresses across classes (agnostic=false)', () => {
    const boxes: YoloBox[] = [
      { label: 'A', score: 0.9, box: box(0, 0, 10, 10) },
      { label: 'B', score: 0.8, box: box(1, 1, 11, 11) }, // same spot, different class -> kept
    ]
    expect(nms(boxes, 0.45)).toHaveLength(2)
  })

  it('returns survivors sorted by score descending', () => {
    const boxes: YoloBox[] = [
      { label: 'A', score: 0.5, box: box(0, 0, 10, 10) },
      { label: 'B', score: 0.95, box: box(50, 50, 60, 60) },
    ]
    expect(nms(boxes, 0.45).map((b) => b.score)).toEqual([0.95, 0.5])
  })
})

describe('isYolov10Output', () => {
  it('recognizes the NMS-free [1,N,6] layout, not the v8/v9 head', () => {
    expect(isYolov10Output([1, 300, 6])).toBe(true)
    expect(isYolov10Output([1, 84, 8400])).toBe(false)
    expect(isYolov10Output([1, 8400, 84])).toBe(false)
  })
})

describe('parseYolov10Output', () => {
  // Rows are [x1, y1, x2, y2, score, classId] in letterboxed 640-space, score 0–1.
  // Layout matches onnx-community/yolov10s (empirically confirmed).
  function rows(r: number[][]): { data: Float32Array; dims: number[] } {
    return { data: new Float32Array(r.flat()), dims: [1, r.length, 6] }
  }

  it('thresholds on score and decodes xyxy without NMS', () => {
    const { data, dims } = rows([
      [100, 100, 200, 200, 0.9, 5],
      [10, 10, 20, 20, 0.1, 0], // below threshold
    ])
    const out = parseYolov10Output(data, dims, { confThreshold: 0.5, scale: 1, padX: 0, padY: 0 })
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('bus')
    expect(out[0].score).toBeCloseTo(0.9)
    expect(out[0].box).toEqual({ xmin: 100, ymin: 100, xmax: 200, ymax: 200 })
  })

  it('undoes letterbox scale + padding back to original coords', () => {
    const { data, dims } = rows([[120, 100, 220, 200, 0.8, 0]])
    // scale 0.5, padX 20, padY 0 → (x - pad) / scale
    const out = parseYolov10Output(data, dims, { confThreshold: 0.3, scale: 0.5, padX: 20, padY: 0 })
    expect(out[0].box).toEqual({ xmin: 200, ymin: 200, xmax: 400, ymax: 400 })
    expect(out[0].label).toBe('person')
  })

  it('rounds a float class id and defaults to COCO labels', () => {
    const { data, dims } = rows([[0, 0, 10, 10, 0.7, 5.0]])
    expect(parseYolov10Output(data, dims, { confThreshold: 0.5, scale: 1, padX: 0, padY: 0 })[0].label).toBe(
      COCO_LABELS[5]
    )
  })
})
