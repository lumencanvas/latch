<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { useRuntimeStore } from '@/stores/runtime'
import { getExecutionEngine } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'

const props = withDefaults(defineProps<{
  nodeId: string
  width?: number
  height?: number
  showPlaceholder?: boolean
}>(), {
  width: 128,
  height: 96,
  showPlaceholder: true,
})

const runtimeStore = useRuntimeStore()
const canvas = ref<HTMLCanvasElement | null>(null)
const hasTexture = ref(false)

/**
 * Update preview from texture
 */
function updatePreview() {
  if (!canvas.value) return

  const ctx = canvas.value.getContext('2d')
  if (!ctx) return

  // Get outputs directly from execution engine
  const engine = getExecutionEngine()
  const outputs = engine.getNodeOutputs(props.nodeId)

  if (!outputs) {
    hasTexture.value = false
    drawPlaceholder(ctx)
    return
  }

  // Check for video element first (webcam, video player)
  const video = outputs.get('video') as HTMLVideoElement | undefined
  if (video instanceof HTMLVideoElement && video.readyState >= 2) {
    hasTexture.value = true
    ctx.drawImage(video, 0, 0, props.width, props.height)
    return
  }

  // Check for direct canvas display (preferred — avoids Three.js round-trip)
  const display = outputs.get('_display')
  if (display instanceof HTMLCanvasElement) {
    hasTexture.value = true
    ctx.drawImage(display, 0, 0, props.width, props.height)
    return
  }

  // Check for texture outputs
  const texture = outputs.get('texture')

  if (!texture) {
    hasTexture.value = false
    drawPlaceholder(ctx)
    return
  }

  // Handle canvas element
  if (texture instanceof HTMLCanvasElement) {
    hasTexture.value = true
    ctx.drawImage(texture, 0, 0, props.width, props.height)
    return
  }

  // Handle THREE.Texture
  if (texture instanceof THREE.Texture) {
    hasTexture.value = true
    const threeRenderer = getThreeShaderRenderer()
    threeRenderer.renderToCanvas(texture, canvas.value)
    return
  }

  // Unknown type
  hasTexture.value = false
  drawPlaceholder(ctx)
}

function drawPlaceholder(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, props.width, props.height)

  if (props.showPlaceholder) {
    ctx.fillStyle = '#666'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('No texture', props.width / 2, props.height / 2)
  }
}

// Animation loop
let animationFrame: number | null = null

function startUpdateLoop() {
  const loop = () => {
    if (runtimeStore.isRunning) {
      updatePreview()
    }
    animationFrame = requestAnimationFrame(loop)
  }
  loop()
}

function stopUpdateLoop() {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
}

onMounted(() => {
  if (canvas.value) {
    canvas.value.width = props.width
    canvas.value.height = props.height
    updatePreview()
    startUpdateLoop()
  }
})

onUnmounted(() => {
  stopUpdateLoop()
})

// Update when node changes
watch(() => props.nodeId, () => {
  updatePreview()
})

// Update when runtime status changes
watch(() => runtimeStore.isRunning, (running) => {
  if (!running) {
    updatePreview()
  }
})

// Handle size changes
watch([() => props.width, () => props.height], ([w, h]) => {
  if (canvas.value) {
    canvas.value.width = w
    canvas.value.height = h
    updatePreview()
  }
})
</script>

<template>
  <div
    class="texture-preview"
    :style="{ width: `${width}px`, height: `${height}px` }"
  >
    <canvas
      ref="canvas"
      class="preview-canvas"
    />
    <div
      v-if="!hasTexture && showPlaceholder"
      class="placeholder"
    >
      <span>No texture</span>
    </div>
  </div>
</template>

<style scoped>
.texture-preview {
  position: relative;
  background: var(--color-neutral-900);
  border: 1px solid var(--color-neutral-700);
  overflow: hidden;
}

.preview-canvas {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  pointer-events: none;
}
</style>
