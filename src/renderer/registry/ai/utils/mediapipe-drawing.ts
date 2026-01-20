/**
 * MediaPipe Drawing Utilities
 *
 * Shared drawing functions for visualizing MediaPipe detection results
 * on canvas elements within custom node components.
 */

// ============================================================================
// Types
// ============================================================================

export interface Landmark {
  x: number
  y: number
  z?: number
  visibility?: number
}

export interface DrawOptions {
  color?: string
  lineWidth?: number
  pointSize?: number
  alpha?: number
}

export interface BoundingBox {
  originX: number
  originY: number
  width: number
  height: number
}

// ============================================================================
// Connection Definitions
// ============================================================================

/**
 * Hand landmark connections (21 points)
 * MediaPipe hand model landmark indices
 */
export const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm
  [5, 9], [9, 13], [13, 17],
]

/**
 * Pose landmark connections (33 points)
 * MediaPipe pose model skeleton connections
 */
export const POSE_CONNECTIONS: [number, number][] = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7], // Right eye
  [0, 4], [4, 5], [5, 6], [6, 8], // Left eye
  [9, 10], // Mouth
  // Torso
  [11, 12], // Shoulders
  [11, 23], [12, 24], // Shoulder to hip
  [23, 24], // Hips
  // Right arm
  [11, 13], [13, 15], // Shoulder → elbow → wrist
  [15, 17], [15, 19], [15, 21], [17, 19], // Wrist → fingers
  // Left arm
  [12, 14], [14, 16], // Shoulder → elbow → wrist
  [16, 18], [16, 20], [16, 22], [18, 20], // Wrist → fingers
  // Right leg
  [23, 25], [25, 27], // Hip → knee → ankle
  [27, 29], [27, 31], [29, 31], // Ankle → foot
  // Left leg
  [24, 26], [26, 28], // Hip → knee → ankle
  [28, 30], [28, 32], [30, 32], // Ankle → foot
]

/**
 * Face mesh contours (simplified set for visualization)
 * These define the main facial features for overlay drawing
 */
export const FACE_OVAL: number[] = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10
]

export const FACE_LEFT_EYE: number[] = [
  263, 249, 390, 373, 374, 380, 381, 382, 362, 263
]

export const FACE_RIGHT_EYE: number[] = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 33
]

export const FACE_LEFT_EYEBROW: number[] = [
  276, 283, 282, 295, 285
]

export const FACE_RIGHT_EYEBROW: number[] = [
  46, 53, 52, 65, 55
]

export const FACE_LIPS_OUTER: number[] = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61
]

export const FACE_LIPS_INNER: number[] = [
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78
]

export const FACE_NOSE: number[] = [
  168, 6, 197, 195, 5, 4, 1, 19, 94, 2
]

// Grouped face contours for easy iteration
export const FACE_CONTOURS = {
  oval: FACE_OVAL,
  leftEye: FACE_LEFT_EYE,
  rightEye: FACE_RIGHT_EYE,
  leftEyebrow: FACE_LEFT_EYEBROW,
  rightEyebrow: FACE_RIGHT_EYEBROW,
  lipsOuter: FACE_LIPS_OUTER,
  lipsInner: FACE_LIPS_INNER,
  nose: FACE_NOSE,
}

/**
 * Face mesh tesselation triangles (subset for performance)
 * Each triplet [a, b, c] defines a triangle
 * This is a subset of MediaPipe's full 468-point tesselation
 */
export const FACE_MESH_TRIANGLES: [number, number, number][] = [
  // Forehead
  [10, 338, 297], [10, 297, 332], [10, 332, 284], [10, 284, 251],
  [10, 109, 67], [10, 67, 103], [10, 103, 54], [10, 54, 21],
  [10, 21, 162], [10, 162, 127], [10, 127, 234], [10, 234, 93],
  // Left cheek
  [234, 93, 132], [132, 93, 58], [58, 172, 136], [136, 150, 149],
  [149, 176, 148], [148, 152, 377], [377, 400, 378], [378, 379, 365],
  // Right cheek
  [127, 162, 21], [21, 54, 103], [103, 67, 109], [389, 251, 284],
  [284, 332, 297], [297, 338, 10], [356, 454, 323], [323, 361, 288],
  // Nose area
  [168, 6, 197], [197, 195, 5], [5, 4, 1], [1, 19, 94],
  // Left eye area
  [263, 249, 390], [390, 373, 374], [374, 380, 381], [381, 382, 362],
  // Right eye area
  [33, 7, 163], [163, 144, 145], [145, 153, 154], [154, 155, 133],
  // Lips area
  [61, 146, 91], [91, 181, 84], [84, 17, 314], [314, 405, 321],
  [321, 375, 291], [78, 95, 88], [88, 178, 87], [87, 14, 317],
  // Chin
  [152, 148, 176], [176, 149, 150], [150, 136, 172], [172, 58, 132],
  // Jaw line
  [397, 365, 379], [379, 378, 400], [400, 377, 152],
  [288, 361, 323], [323, 454, 356],
]

/**
 * Hand mesh triangles for filled visualization
 * Creates a mesh surface across the palm and fingers
 */
export const HAND_MESH_TRIANGLES: [number, number, number][] = [
  // Palm triangles
  [0, 1, 5], [0, 5, 9], [0, 9, 13], [0, 13, 17],
  [5, 9, 6], [9, 13, 10], [13, 17, 14],
  // Between fingers
  [5, 6, 9], [6, 9, 10], [9, 10, 13], [10, 13, 14], [13, 14, 17], [14, 17, 18],
  // Thumb
  [1, 2, 5], [2, 3, 6], [3, 4, 7],
  // Index finger
  [5, 6, 7], [6, 7, 8],
  // Middle finger
  [9, 10, 11], [10, 11, 12],
  // Ring finger
  [13, 14, 15], [14, 15, 16],
  // Pinky
  [17, 18, 19], [18, 19, 20],
]

// ============================================================================
// Drawing Functions
// ============================================================================

/**
 * Draw video frame to canvas as background
 */
export function drawVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number
): void {
  ctx.drawImage(video, 0, 0, width, height)
}

/**
 * Clear canvas with optional background color
 */
export function clearCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bgColor = '#0a0a0a'
): void {
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, width, height)
}

/**
 * Draw landmark points
 */
export function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
  options: DrawOptions = {}
): void {
  const {
    color = '#00ff00',
    pointSize = 4,
    alpha = 1,
  } = options

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color

  for (const lm of landmarks) {
    if (!lm || typeof lm.x !== 'number' || typeof lm.y !== 'number') continue

    const x = lm.x * width
    const y = lm.y * height
    const visibility = lm.visibility ?? 1

    // Skip only if explicitly low visibility (hand landmarks don't have visibility)
    if (visibility < 0.3) continue

    ctx.beginPath()
    ctx.arc(x, y, pointSize / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

/**
 * Draw connections between landmarks
 */
export function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  connections: [number, number][],
  width: number,
  height: number,
  options: DrawOptions = {}
): void {
  const {
    color = '#00ff00',
    lineWidth = 2,
    alpha = 1,
  } = options

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'

  for (const [startIdx, endIdx] of connections) {
    const start = landmarks[startIdx]
    const end = landmarks[endIdx]

    if (!start || !end) continue
    if (typeof start.x !== 'number' || typeof end.x !== 'number') continue

    const startVis = start.visibility ?? 1
    const endVis = end.visibility ?? 1
    // Skip only if both points have very low visibility
    if (startVis < 0.3 && endVis < 0.3) continue

    ctx.beginPath()
    ctx.moveTo(start.x * width, start.y * height)
    ctx.lineTo(end.x * width, end.y * height)
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * Draw a contour path (closed polygon from landmark indices)
 */
export function drawContour(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  indices: number[],
  width: number,
  height: number,
  options: DrawOptions = {}
): void {
  const {
    color = '#00ff00',
    lineWidth = 1,
    alpha = 1,
  } = options

  if (indices.length < 2) return

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()

  const firstLm = landmarks[indices[0]]
  if (!firstLm) {
    ctx.restore()
    return
  }

  ctx.moveTo(firstLm.x * width, firstLm.y * height)

  for (let i = 1; i < indices.length; i++) {
    const lm = landmarks[indices[i]]
    if (lm) {
      ctx.lineTo(lm.x * width, lm.y * height)
    }
  }

  ctx.stroke()
  ctx.restore()
}

/**
 * Draw bounding box with label and confidence
 */
export function drawBoundingBox(
  ctx: CanvasRenderingContext2D,
  box: BoundingBox,
  width: number,
  height: number,
  label?: string,
  confidence?: number,
  options: DrawOptions = {}
): void {
  const {
    color = '#00ff00',
    lineWidth = 2,
    alpha = 1,
  } = options

  const x = box.originX * width
  const y = box.originY * height
  const w = box.width * width
  const h = box.height * height

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.setLineDash([])

  // Draw box
  ctx.strokeRect(x, y, w, h)

  // Draw label background and text
  if (label) {
    const text = confidence !== undefined
      ? `${label} ${(confidence * 100).toFixed(0)}%`
      : label

    ctx.font = 'bold 12px monospace'
    const metrics = ctx.measureText(text)
    const textHeight = 14
    const padding = 4

    // Label background
    ctx.fillStyle = color
    ctx.fillRect(
      x,
      y - textHeight - padding,
      metrics.width + padding * 2,
      textHeight + padding
    )

    // Label text
    ctx.fillStyle = '#000'
    ctx.fillText(text, x + padding, y - padding)
  }

  ctx.restore()
}

/**
 * Draw text label on canvas
 */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: DrawOptions = {}
): void {
  const {
    color = '#00ff00',
    alpha = 1,
  } = options

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.font = 'bold 14px monospace'
  ctx.fillText(text, x, y)
  ctx.restore()
}

/**
 * Get hand color based on handedness
 */
export function getHandColor(handedness: string, defaultColor: string): string {
  const lower = handedness.toLowerCase()
  if (lower === 'left') return '#ff6b6b' // Red-ish for left
  if (lower === 'right') return '#4ecdc4' // Cyan for right
  return defaultColor
}

/**
 * Parse hex color to RGB components
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null
}

/**
 * Create rgba color string from hex and alpha
 */
export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(0, 255, 0, ${alpha})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

/**
 * Draw mesh triangles (wireframe)
 */
export function drawMeshTriangles(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  triangles: [number, number, number][],
  width: number,
  height: number,
  options: DrawOptions = {}
): void {
  const {
    color = '#00ff00',
    lineWidth = 0.5,
    alpha = 0.6,
  } = options

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth

  for (const [a, b, c] of triangles) {
    const p1 = landmarks[a]
    const p2 = landmarks[b]
    const p3 = landmarks[c]

    if (!p1 || !p2 || !p3) continue

    ctx.beginPath()
    ctx.moveTo(p1.x * width, p1.y * height)
    ctx.lineTo(p2.x * width, p2.y * height)
    ctx.lineTo(p3.x * width, p3.y * height)
    ctx.closePath()
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * Draw filled mesh triangles with optional wireframe
 */
export function drawFilledMesh(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  triangles: [number, number, number][],
  width: number,
  height: number,
  options: DrawOptions & { fillAlpha?: number; wireframe?: boolean } = {}
): void {
  const {
    color = '#00ff00',
    lineWidth = 0.5,
    alpha = 0.3,
    fillAlpha = 0.15,
    wireframe = true,
  } = options

  ctx.save()

  // Draw filled triangles
  ctx.fillStyle = hexToRgba(color, fillAlpha)
  for (const [a, b, c] of triangles) {
    const p1 = landmarks[a]
    const p2 = landmarks[b]
    const p3 = landmarks[c]

    if (!p1 || !p2 || !p3) continue

    ctx.beginPath()
    ctx.moveTo(p1.x * width, p1.y * height)
    ctx.lineTo(p2.x * width, p2.y * height)
    ctx.lineTo(p3.x * width, p3.y * height)
    ctx.closePath()
    ctx.fill()
  }

  // Draw wireframe on top
  if (wireframe) {
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth

    for (const [a, b, c] of triangles) {
      const p1 = landmarks[a]
      const p2 = landmarks[b]
      const p3 = landmarks[c]

      if (!p1 || !p2 || !p3) continue

      ctx.beginPath()
      ctx.moveTo(p1.x * width, p1.y * height)
      ctx.lineTo(p2.x * width, p2.y * height)
      ctx.lineTo(p3.x * width, p3.y * height)
      ctx.closePath()
      ctx.stroke()
    }
  }

  ctx.restore()
}

/**
 * Calculate bounding box from landmarks
 */
export function calculateLandmarkBounds(
  landmarks: Landmark[],
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } | null {
  if (landmarks.length === 0) return null

  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  for (const lm of landmarks) {
    const x = lm.x * width
    const y = lm.y * height
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  }
}

/**
 * Draw a bounding box around landmarks
 */
export function drawLandmarkBoundingBox(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
  options: DrawOptions & { padding?: number } = {}
): void {
  const {
    color = '#00ff00',
    lineWidth = 2,
    alpha = 1,
    padding = 5,
  } = options

  const bounds = calculateLandmarkBounds(landmarks, width, height)
  if (!bounds) return

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.setLineDash([4, 4])

  ctx.strokeRect(
    bounds.x - padding,
    bounds.y - padding,
    bounds.w + padding * 2,
    bounds.h + padding * 2
  )

  ctx.restore()
}
