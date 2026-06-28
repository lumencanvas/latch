<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { Gamepad2, Play, Square, RotateCcw } from 'lucide-vue-next'
import { dataTypeMeta } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'
import { useAssetsStore } from '@/stores/assets'
import { coreSpec, detectCoreFromFilename } from '@/services/emulation/coreMap'
import { EmulatorJSLoader, DEFAULT_EJS_DATA } from '@/services/emulation/emulatorjs'
import { registerEmulatorNode, unregisterEmulator, getEmulatorLoader } from '@/engine/executors/emulation'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()
const assetsStore = useAssetsStore()

const container = ref<HTMLDivElement | null>(null)
// EmulatorJS renders into this manually-managed host. The editor view is
// KeepAlive-cached, so switching to the Control tab DEACTIVATES it and detaches
// its DOM — which stops EmulatorJS painting, freezing the captured texture on the
// last editor frame. We keep the host attached to the rendered document across
// view switches by parking it off-screen in <body> on deactivate (pinning its size
// so the canvas never resizes — a resize is what caused the earlier glCopySubTexture
// flood) and docking it back into the node on activate. Reparenting preserves the
// WebGL context, audio, and input.
let host: HTMLDivElement | null = null
let loader: EmulatorJSLoader | null = null
let loadWatchdog: number | null = null
let currentRomUrl: string | null = null
const booted = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)

// --- controls (from node.data) ---
const romId = computed(() => (props.data?.rom as string | null) ?? null)
const coreSelection = computed(() => (props.data?.core as string) ?? 'auto')
const volume = computed(() => (props.data?.volume as number) ?? 0.5)
const pathToData = computed(() => (props.data?.pathToData as string) || DEFAULT_EJS_DATA)

const romName = computed(() => (romId.value ? assetsStore.assets.find((a) => a.id === romId.value)?.name ?? null : null))
const resolvedCoreKey = computed(() => {
  if (coreSelection.value !== 'auto') return coreSelection.value
  return (romName.value && detectCoreFromFilename(romName.value)) || 'nes'
})
const maxPlayers = computed(() => coreSpec(resolvedCoreKey.value).maxPlayers)

// --- size (resizable) ---
const nodeWidth = computed(() => (props.data?.width as number) ?? 280)
const screenHeight = computed(() => (props.data?.height as number) ?? 240)

const outputs = [
  { id: 'texture', label: 'Video', type: 'texture' },
  { id: 'audio', label: 'Audio', type: 'audio' },
  { id: 'running', label: 'Running', type: 'boolean' },
  { id: 'system', label: 'System', type: 'string' },
]

const inputPorts = computed(() => [
  { id: 'start', label: 'Start', type: 'trigger' },
  { id: 'stop', label: 'Stop', type: 'trigger' },
  { id: 'reset', label: 'Reset', type: 'trigger' },
  ...Array.from({ length: maxPlayers.value }, (_, i) => ({
    id: `controller${i}`,
    label: `Player ${i + 1}`,
    type: 'data',
  })),
])

const hoveredPort = ref<string | null>(null)

function typeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}

async function onLoad() {
  if (!loader || !romId.value) {
    error.value = 'Pick a ROM first'
    return
  }
  loading.value = true
  error.value = null
  if (loadWatchdog) { clearTimeout(loadWatchdog); loadWatchdog = null }
  try {
    const url = await assetsStore.getAssetUrl(romId.value)
    if (!url) throw new Error('ROM not found')
    if (currentRomUrl) URL.revokeObjectURL(currentRomUrl)
    currentRomUrl = url
    const key = resolvedCoreKey.value
    const spec = coreSpec(key)
    loader.boot({
      core: spec.core,
      gameUrl: url,
      gameName: romName.value ?? 'game',
      pathToData: pathToData.value,
      volume: volume.value,
      threaded: spec.threaded,
      onStart: () => {
        booted.value = true
        loading.value = false
        if (loadWatchdog) { clearTimeout(loadWatchdog); loadWatchdog = null }
      },
    })
    // If the core never reports a start (bad ROM, network, wrong core), don't leave
    // the Load button stuck disabled.
    loadWatchdog = window.setTimeout(() => {
      loadWatchdog = null
      if (loading.value) {
        loading.value = false
        if (!booted.value) error.value = 'Load timed out — check the ROM and system'
      }
    }, 30000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load'
    loading.value = false
  }
}

function onStop() {
  loader?.teardown()
  booted.value = false
  loading.value = false
  if (loadWatchdog) { clearTimeout(loadWatchdog); loadWatchdog = null }
}

function onReset() {
  loader?.reset()
}

// Apply live volume changes to a running emulator without a reload.
watch(volume, (v) => loader?.setVolume(v))

// --- resize (bottom-right handle), mirrors the Monitor node ---
function startResize(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  const startX = event.clientX
  const startY = event.clientY
  const startW = nodeWidth.value
  const startH = screenHeight.value
  const onMove = (e: MouseEvent) => {
    flowsStore.updateNodeData(props.id, {
      width: Math.max(160, startW + (e.clientX - startX)),
      height: Math.max(120, startH + (e.clientY - startY)),
    })
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

/** Dock the host inside the node (editor active): fill the screen, let scoped CSS size the canvas. */
function dockHostInNode() {
  if (!host || !container.value) return
  host.style.cssText = 'width:100%;height:100%;'
  const c = host.querySelector('canvas') as HTMLCanvasElement | null
  if (c) { c.style.width = ''; c.style.height = '' }
  if (host.parentNode !== container.value) container.value.appendChild(host)
}

/**
 * Park the host off-screen but still attached to <body>, so EmulatorJS keeps
 * painting while the editor view is deactivated. Pin the host AND canvas to their
 * current pixel size first so leaving the node's scoped CSS doesn't resize the
 * canvas backing (the resize is what triggered the prior glCopySubTexture flood).
 */
function parkHostOffscreen() {
  if (!host) return
  const w = host.offsetWidth || 280
  const h = host.offsetHeight || 240
  const c = host.querySelector('canvas') as HTMLCanvasElement | null
  if (c) {
    c.style.width = `${c.clientWidth || w}px`
    c.style.height = `${c.clientHeight || h}px`
  }
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${w}px;height:${h}px;pointer-events:none;`
  document.body.appendChild(host)
}

onMounted(() => {
  if (!container.value) return
  // Vue Flow has `only-render-visible-elements` ON, so this component is UNMOUNTED
  // whenever the node scrolls/zooms off-screen and remounted when it returns. If the
  // emulator is still alive (parked off-screen by the previous unmount), re-adopt its
  // live host + loader instead of booting a new one — otherwise the canvas is rebuilt,
  // the WebGL context is lost, and the libretro core aborts.
  const existing = getEmulatorLoader(props.id)
  if (existing) {
    loader = existing
    host = existing.getHost() as HTMLDivElement
    dockHostInNode()
    booted.value = existing.isReady()
  } else {
    host = document.createElement('div')
    host.style.cssText = 'width:100%;height:100%;'
    container.value.appendChild(host)
    loader = new EmulatorJSLoader(host)
  }
  // (Re)register so the start/stop/reset trigger inlets drive the emulator and the
  // executor injects + captures. Re-registering with the SAME loader preserves the
  // captured texture/audio (see registerEmulatorNode); it only refreshes callbacks.
  registerEmulatorNode(props.id, {
    loader,
    getCoreKey: () => resolvedCoreKey.value,
    onStart: onLoad,
    onStop,
    onReset,
  })
})

// KeepAlive lifecycle: keep the emulator canvas in the rendered DOM across views.
onActivated(dockHostInNode)
onDeactivated(parkHostOffscreen)

onUnmounted(() => {
  if (loadWatchdog) { clearTimeout(loadWatchdog); loadWatchdog = null }
  // Distinguish virtualization (node still in the graph, just scrolled off-screen)
  // from real removal (node deleted / flow closed). On virtualization, KEEP the
  // emulator alive parked off-screen so it resumes — and keeps outputting its
  // texture — on remount; only tear down when the node is actually gone.
  const stillInGraph = flowsStore.activeFlow?.nodes.some((n) => n.id === props.id) ?? false
  if (stillInGraph) {
    parkHostOffscreen()
  } else {
    unregisterEmulator(props.id) // frees loader, texture/audio, and removes the host
    if (currentRomUrl) {
      URL.revokeObjectURL(currentRomUrl)
      currentRomUrl = null
    }
  }
  loader = null
  host = null
})
</script>

<template>
  <div
    class="emulator-node"
    :class="{ selected: props.selected }"
    :style="{ width: `${nodeWidth}px` }"
  >
    <!-- input handles (left): start/stop/reset + one per player -->
    <div class="handles-column handles-left">
      <div
        v-for="inp in inputPorts"
        :key="inp.id"
        class="handle-slot"
        @mouseenter="hoveredPort = inp.id"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          :id="inp.id"
          type="target"
          :position="Position.Left"
          :style="{ background: typeColor(inp.type) }"
          class="port-handle"
        />
        <div
          class="port-label port-label-left"
          :class="{ visible: hoveredPort === inp.id || props.selected }"
        >
          {{ inp.label }}
        </div>
      </div>
    </div>

    <!-- output handles (right) -->
    <div class="handles-column handles-right">
      <div
        v-for="out in outputs"
        :key="out.id"
        class="handle-slot"
        @mouseenter="hoveredPort = `out-${out.id}`"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          :id="out.id"
          type="source"
          :position="Position.Right"
          :style="{ background: typeColor(out.type) }"
          class="port-handle"
        />
        <div
          class="port-label port-label-right"
          :class="{ visible: hoveredPort === `out-${out.id}` || props.selected }"
        >
          {{ out.label }}
        </div>
      </div>
    </div>

    <div class="node-content">
      <div class="node-header">
        <Gamepad2
          :size="14"
          class="header-icon"
        />
        <span class="node-title">Emulator</span>
        <span
          class="status-dot"
          :class="{ on: booted }"
        />
        <button
          class="hbtn nodrag"
          title="Load ROM"
          :disabled="loading || !romId"
          @click.stop="onLoad"
          @mousedown.stop
        >
          <Play :size="12" />
        </button>
        <button
          class="hbtn nodrag"
          title="Reset"
          @click.stop="onReset"
          @mousedown.stop
        >
          <RotateCcw :size="12" />
        </button>
        <button
          class="hbtn nodrag"
          title="Stop"
          @click.stop="onStop"
          @mousedown.stop
        >
          <Square :size="12" />
        </button>
      </div>

      <!-- EmulatorJS renders into this container -->
      <div
        ref="container"
        class="emulator-screen nodrag"
        :style="{ height: `${screenHeight}px` }"
        @mousedown.stop
      >
        <div
          v-if="!booted"
          class="screen-placeholder"
        >
          <Gamepad2 :size="28" />
          <span>{{ error || (loading ? 'Loading…' : romId ? 'Press ▶ to load' : 'Pick a ROM in the panel') }}</span>
        </div>
      </div>

      <!-- resize handle -->
      <div
        class="resize-handle nodrag"
        title="Resize"
        @mousedown="startResize"
      />
    </div>
  </div>
</template>

<style scoped>
.emulator-node {
  position: relative;
  min-width: 200px;
  font-family: var(--font-mono);
}
.node-content {
  position: relative;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-default);
  box-shadow: 3px 3px 0 0 var(--color-neutral-300);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
  overflow: hidden;
}
.emulator-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}
.handles-column {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  z-index: 10;
}
.handles-left { left: 0; }
.handles-right { right: 0; }
.handle-slot {
  position: relative;
  height: 16px;
  display: flex;
  align-items: center;
}
.port-label {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  font-size: 9px;
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-600);
  background: var(--color-neutral-0);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--color-neutral-200);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 1000;
}
.port-label.visible { opacity: 1; }
.port-label-left { right: 14px; }
.port-label-right { left: 14px; }
.node-header {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--color-neutral-200);
  border-left: 3px solid #3b82f6;
}
.header-icon { color: var(--color-neutral-500); }
.node-title {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-800);
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-neutral-300);
  margin-right: var(--space-1);
}
.status-dot.on {
  background: var(--color-success, #22c55e);
  box-shadow: 0 0 5px var(--color-success, #22c55e);
}
.hbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  color: var(--color-neutral-600);
  cursor: pointer;
}
.hbtn:hover:not(:disabled) {
  border-color: var(--color-primary-400);
  color: var(--color-primary-600);
}
.hbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.emulator-screen {
  position: relative;
  width: 100%;
  background: #000;
  overflow: hidden;
}
.emulator-screen :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
  display: block;
}
.screen-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-neutral-500);
  font-size: var(--font-size-xs);
  text-align: center;
  padding: var(--space-3);
}
.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  background:
    linear-gradient(135deg, transparent 50%, var(--color-neutral-300) 50%, var(--color-neutral-300) 60%, transparent 60%, transparent 70%, var(--color-neutral-300) 70%, var(--color-neutral-300) 80%, transparent 80%);
  z-index: 11;
}
:deep(.port-handle) {
  width: var(--node-port-size, 10px) !important;
  height: var(--node-port-size, 10px) !important;
  border: 2px solid var(--color-neutral-0) !important;
  border-radius: 50% !important;
}
</style>
