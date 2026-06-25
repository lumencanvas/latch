/**
 * YOLO (v8/v9/GELAN) ONNX post-processing — pure, layout-robust, unit-tested.
 *
 * These models share a detection head: input `[1,3,640,640]` (letterboxed RGB,
 * /255), output `[1, 4+numClasses, numAnchors]` (channels-major, e.g.
 * `[1,84,8400]` for COCO) — or the transposed `[1, numAnchors, 4+numClasses]`.
 * Each anchor: `cx,cy,w,h` (in letterboxed 640-space pixels) + per-class scores
 * (already sigmoid'd in standard Ultralytics exports). Box decode undoes the
 * letterbox (subtract pad, divide by scale) back to original-image pixels.
 *
 * The canvas-based letterbox preprocessing lives in the worker (needs
 * OffscreenCanvas); everything here is pure so it can be tested headless.
 */

export interface YoloBox {
  label: string
  score: number
  box: { xmin: number; ymin: number; xmax: number; ymax: number }
}

/** Standard COCO 80-class label order (Ultralytics export). */
export const COCO_LABELS: string[] = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
  'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
  'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator',
  'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush',
]

export interface ParseOptions {
  /** Per-class confidence cutoff (0–1). */
  confThreshold: number
  /** Letterbox scale (min(size/w, size/h)) used in preprocessing. */
  scale: number
  /** Letterbox horizontal padding (px in 640-space). */
  padX: number
  /** Letterbox vertical padding (px in 640-space). */
  padY: number
  /** Class label table (defaults to COCO). */
  labels?: string[]
  /**
   * Known class count. When given, layout is detected exactly (the dim equal to
   * `4+numClasses` is the attributes axis); otherwise the attributes axis is
   * inferred as the smaller dim (always true for real YOLO output, where anchors
   * ≫ attributes).
   */
  numClasses?: number
}

/**
 * Decode a raw YOLO output tensor into boxes in ORIGINAL-image pixel coords,
 * filtered by per-class confidence. Handles both channels-major `[1,A,N]` and
 * anchors-major `[1,N,A]` layouts (A = 4+numClasses is the smaller dim).
 */
export function parseYoloOutput(
  data: Float32Array | number[],
  dims: number[],
  opts: ParseOptions
): YoloBox[] {
  const { confThreshold, scale, padX, padY } = opts
  const labels = opts.labels ?? COCO_LABELS

  // dims is [batch, d1, d2]. The attributes axis is `4+numClasses`; identify it
  // exactly when numClasses is known, else fall back to "attributes is smaller"
  // (always true for real YOLO output: anchors ≫ attributes).
  const d1 = dims[dims.length - 2]
  const d2 = dims[dims.length - 1]
  const expectedAttrs = opts.numClasses != null ? opts.numClasses + 4 : null
  let channelsMajor: boolean
  if (expectedAttrs != null && (d1 === expectedAttrs || d2 === expectedAttrs)) {
    channelsMajor = d1 === expectedAttrs
  } else {
    channelsMajor = d1 <= d2
  }
  const numAttrs = channelsMajor ? d1 : d2
  const numAnchors = channelsMajor ? d2 : d1
  const numClasses = opts.numClasses ?? numAttrs - 4

  const at = (anchor: number, attr: number): number =>
    channelsMajor ? data[attr * numAnchors + anchor] : data[anchor * numAttrs + attr]

  const out: YoloBox[] = []
  for (let a = 0; a < numAnchors; a++) {
    let best = 0
    let bestScore = 0
    for (let c = 0; c < numClasses; c++) {
      const s = at(a, 4 + c)
      if (s > bestScore) {
        bestScore = s
        best = c
      }
    }
    if (bestScore < confThreshold) continue

    const cx = at(a, 0)
    const cy = at(a, 1)
    const w = at(a, 2)
    const h = at(a, 3)
    out.push({
      label: labels[best] ?? String(best),
      score: bestScore,
      box: {
        xmin: (cx - w / 2 - padX) / scale,
        ymin: (cy - h / 2 - padY) / scale,
        xmax: (cx + w / 2 - padX) / scale,
        ymax: (cy + h / 2 - padY) / scale,
      },
    })
  }
  return out
}

/** True if a tensor shape is YOLOv10's NMS-free `[1, N, 6]` layout. */
export function isYolov10Output(dims: number[]): boolean {
  return dims[dims.length - 1] === 6
}

/**
 * Decode a YOLOv10 output tensor. YOLOv10 is NMS-free (one-to-one head): output
 * is `[1, N, 6]` (N=300) where each row is `[x1, y1, x2, y2, score, classId]` —
 * xyxy already, in letterboxed 640-space, score already 0–1, class explicit. So
 * decode is just threshold + undo letterbox: no sigmoid, no argmax, no NMS.
 * Empirically confirmed on `onnx-community/yolov10s` (bus.jpg → {bus:1, person:4},
 * rows sorted by score). Coords map back to original-image pixels.
 */
export function parseYolov10Output(
  data: Float32Array | number[],
  dims: number[],
  opts: Omit<ParseOptions, 'numClasses'>
): YoloBox[] {
  const { confThreshold, scale, padX, padY } = opts
  const labels = opts.labels ?? COCO_LABELS
  const stride = dims[dims.length - 1] // 6
  const rows = dims[dims.length - 2]
  const out: YoloBox[] = []
  for (let i = 0; i < rows; i++) {
    const b = i * stride
    const score = data[b + 4]
    if (score < confThreshold) continue
    const cls = Math.round(data[b + 5])
    out.push({
      label: labels[cls] ?? String(cls),
      score,
      box: {
        xmin: (data[b] - padX) / scale,
        ymin: (data[b + 1] - padY) / scale,
        xmax: (data[b + 2] - padX) / scale,
        ymax: (data[b + 3] - padY) / scale,
      },
    })
  }
  return out
}

/** Intersection-over-union of two xyxy boxes. */
export function iou(a: YoloBox['box'], b: YoloBox['box']): number {
  const ix1 = Math.max(a.xmin, b.xmin)
  const iy1 = Math.max(a.ymin, b.ymin)
  const ix2 = Math.min(a.xmax, b.xmax)
  const iy2 = Math.min(a.ymax, b.ymax)
  const iw = Math.max(0, ix2 - ix1)
  const ih = Math.max(0, iy2 - iy1)
  const inter = iw * ih
  if (inter <= 0) return 0
  const areaA = Math.max(0, a.xmax - a.xmin) * Math.max(0, a.ymax - a.ymin)
  const areaB = Math.max(0, b.xmax - b.xmin) * Math.max(0, b.ymax - b.ymin)
  const union = areaA + areaB - inter
  return union > 0 ? inter / union : 0
}

/**
 * Per-class greedy non-max suppression (matches Ultralytics' default
 * agnostic=false): boxes of different classes never suppress each other.
 * Returns survivors sorted by score descending.
 */
export function nms(boxes: YoloBox[], iouThreshold: number, maxOutput = 300): YoloBox[] {
  const byClass = new Map<string, YoloBox[]>()
  for (const b of boxes) {
    const arr = byClass.get(b.label)
    if (arr) arr.push(b)
    else byClass.set(b.label, [b])
  }

  const kept: YoloBox[] = []
  for (const arr of byClass.values()) {
    arr.sort((x, y) => y.score - x.score)
    const suppressed = new Array<boolean>(arr.length).fill(false)
    for (let i = 0; i < arr.length; i++) {
      if (suppressed[i]) continue
      kept.push(arr[i])
      for (let j = i + 1; j < arr.length; j++) {
        if (!suppressed[j] && iou(arr[i].box, arr[j].box) > iouThreshold) {
          suppressed[j] = true
        }
      }
    }
  }

  kept.sort((a, b) => b.score - a.score)
  return kept.length > maxOutput ? kept.slice(0, maxOutput) : kept
}
