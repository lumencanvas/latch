<script setup lang="ts">
/**
 * NodeView — the single interpreter for the declarative `ui` schema (Phase 3 bullet 2). Renders a
 * node's `ui.rows` on either surface, evaluating the same `when` as everything else and delegating
 * primitive widgets to <ControlRenderer> (reuse), Tier-A rich widgets, and Tier-B AGGREGATE widgets
 * (one structured value ↔ several flat controls) to a closed registry private to this file.
 * Presentational: it reads `values` + runtime outputs and emits `update(controlId, value)` (aggregates
 * fan out one per changed field); the host owns the write/undo path. See the DECLARATIVE_UI design doc.
 */
import { computed } from 'vue'
import type { NodeDefinition, ControlDefinition, UIWidget, Surface } from '@/stores/nodes'
import { evaluateWhen } from '@/composables/useControlHelpers'
import { useRuntimeStore } from '@/stores/runtime'
import ControlRenderer from '@/components/controls/ControlRenderer.vue'
import RotaryKnob from '@/components/controls/RotaryKnob.vue'
import AssetPickerControl from '@/components/controls/AssetPickerControl.vue'
import ConnectionSelect from '@/components/connections/ConnectionSelect.vue'
import EnvelopeEditor, { type EnvelopeData } from '@/components/controls/EnvelopeEditor.vue'
import EQEditor, { type EQBand, type EQData } from '@/components/controls/EQEditor.vue'
import WaveformEditor, { type WaveformData } from '@/components/controls/WaveformEditor.vue'
import XYPad, { type XYValue } from '@/components/controls/XYPad.vue'

const props = defineProps<{
  nodeId: string
  definition: NodeDefinition
  values: Record<string, unknown>
  surface: Surface
}>()

const emit = defineEmits<{
  update: [controlId: string, value: unknown]
}>()

const runtimeStore = useRuntimeStore()

/** Primitive widget types delegate to <ControlRenderer>; the rest dispatch below. */
const PRIMITIVES = new Set(['slider', 'number', 'toggle', 'select', 'text', 'color'])

const controlContext = computed(() => (props.surface === 'node' ? 'canvas' : 'panel'))

/** The rows visible on this surface (schema-level `surfaces` gate). */
const rows = computed(() => {
  const ui = props.definition.ui
  if (!ui) return []
  const surfaces = ui.surfaces ?? ['node', 'panel']
  if (!surfaces.includes(props.surface)) return []
  return ui.rows
})

function controlFor(bind: string): ControlDefinition | undefined {
  return props.definition.controls.find((c) => c.id === bind)
}

function isVisible(when: UIWidget['when']): boolean {
  return evaluateWhen(when, props.values)
}

/** Read the bound value — a control value, or a runtime output for `source: 'output'`. */
function readValue(w: UIWidget): unknown {
  if (w.source === 'output') {
    return runtimeStore.getNodeMetrics(props.nodeId)?.outputValues?.[w.bind]
  }
  return props.values[w.bind]
}

function readout(w: UIWidget): string {
  const v = readValue(w)
  if (v === undefined || v === null) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'string') return v
  return typeof v === 'object' ? 'Object' : String(v)
}

function num(w: UIWidget, key: string, fallback: number): number {
  const fromWidget = w.props?.[key]
  if (typeof fromWidget === 'number') return fromWidget
  const fromControl = controlFor(w.bind)?.props?.[key]
  return typeof fromControl === 'number' ? fromControl : fallback
}
function str(w: UIWidget, key: string, fallback: string): string {
  const v = w.props?.[key]
  return typeof v === 'string' ? v : fallback
}

// Typed value accessors — kept in <script> so the template avoids `|` union casts (which the
// vue/no-deprecated-filter lint rule reads as a filter pipe).
function assetValue(w: UIWidget): string | null {
  const v = props.values[w.bind]
  return typeof v === 'string' ? v : null
}
function connectionValue(w: UIWidget): string | undefined {
  const v = props.values[w.bind]
  return typeof v === 'string' ? v : undefined
}
function assetType(w: UIWidget): 'image' | 'video' | 'audio' | 'all' {
  const t = str(w, 'assetType', 'all')
  return t === 'image' || t === 'video' || t === 'audio' ? t : 'all'
}

// ── Tier-B aggregate widgets: one structured value ↔ several flat controls ──────────────────────
// The widget's `props.fields` names the bound control ids, positionally matched to the widget's
// structured keys. Aggregates are built-in only (validateUISchema forbids them for custom nodes), so
// this trusted mapping never crosses the boundary. Each edit fans out one `update` per field — the
// host's debounced recordParamEdit coalesces them into a single undo step.
const ENV_ORDER: (keyof EnvelopeData)[] = ['attack', 'decay', 'sustain', 'release']

function aggregateFields(w: UIWidget): string[] {
  const f = w.props?.fields
  return Array.isArray(f) ? f.map((x) => String(x)) : []
}

/**
 * One aggregate field, read as a number: bound value → the control's declared default → 0. Mirrors
 * each bespoke node's per-field defaults, so a missing field never collapses to a uniform 0. Shared
 * by the env and eq adapters (both fan positional scalar controls into a structured widget value).
 */
function fieldNumber(fields: string[], i: number): number {
  const v = props.values[fields[i]]
  if (typeof v === 'number') return v
  const def = controlFor(fields[i])?.default
  return typeof def === 'number' ? def : 0
}

function envValue(w: UIWidget): EnvelopeData {
  const fields = aggregateFields(w)
  return {
    attack: fieldNumber(fields, 0),
    decay: fieldNumber(fields, 1),
    sustain: fieldNumber(fields, 2),
    release: fieldNumber(fields, 3),
  }
}

function onEnv(w: UIWidget, data: EnvelopeData): void {
  const fields = aggregateFields(w)
  ENV_ORDER.forEach((k, i) => {
    if (fields[i]) emit('update', fields[i], data[k])
  })
}

// eq: 9 flat controls chunked by 3 ↔ { bands: [{frequency,gain,q}×3] } (mirrors bespoke _parametric-eq:
// band b ← [freq_(b+1), gain_(b+1), q_(b+1)]). Positional, like env.
const EQ_BAND_KEYS: (keyof EQBand)[] = ['frequency', 'gain', 'q']
const EQ_BANDS = 3

function eqValue(w: UIWidget): EQData {
  const fields = aggregateFields(w)
  const bands: EQBand[] = []
  for (let b = 0; b < EQ_BANDS; b++) {
    bands.push({
      frequency: fieldNumber(fields, b * 3),
      gain: fieldNumber(fields, b * 3 + 1),
      q: fieldNumber(fields, b * 3 + 2),
    })
  }
  return { bands }
}

function onEq(w: UIWidget, data: EQData): void {
  const fields = aggregateFields(w)
  data.bands.forEach((band, b) => {
    EQ_BAND_KEYS.forEach((k, j) => {
      const idx = b * 3 + j
      if (fields[idx]) emit('update', fields[idx], band[k])
    })
  })
}

// wave: 2 heterogeneous fields ↔ { samples[], preset } (mirrors bespoke _wavetable: waveform↔samples,
// preset↔preset). Unlike env/eq the fields are non-numeric, so fall back per-type: array default → [],
// string default → 'sine'.
function waveValue(w: UIWidget): WaveformData {
  const fields = aggregateFields(w)
  const rawSamples = props.values[fields[0]]
  const defSamples = controlFor(fields[0])?.default
  const samples = Array.isArray(rawSamples)
    ? (rawSamples as number[])
    : Array.isArray(defSamples)
      ? (defSamples as number[])
      : []
  const rawPreset = props.values[fields[1]]
  const defPreset = controlFor(fields[1])?.default
  const preset = typeof rawPreset === 'string'
    ? rawPreset
    : typeof defPreset === 'string'
      ? defPreset
      : 'sine'
  return { samples, preset: preset as WaveformData['preset'] }
}

function onWave(w: UIWidget, data: WaveformData): void {
  const fields = aggregateFields(w)
  if (fields[0]) emit('update', fields[0], data.samples)
  if (fields[1]) emit('update', fields[1], data.preset)
}

// xy: 2 flat controls ↔ { x, y } (both 0..1). Positional, like env; mirrors bespoke xy-pad's
// normalizedX/normalizedY (range min/max stays as separate primitive controls, per the design).
function xyValue(w: UIWidget): XYValue {
  const fields = aggregateFields(w)
  return { x: fieldNumber(fields, 0), y: fieldNumber(fields, 1) }
}

function onXy(w: UIWidget, data: XYValue): void {
  const fields = aggregateFields(w)
  if (fields[0]) emit('update', fields[0], data.x)
  if (fields[1]) emit('update', fields[1], data.y)
}
</script>

<template>
  <div
    class="node-view"
    :class="`nv-${surface}`"
  >
    <template
      v-for="(row, ri) in rows"
      :key="ri"
    >
      <div
        v-if="isVisible(row.when)"
        class="nv-row"
      >
        <span
          v-if="row.label"
          class="nv-row-label"
        >{{ row.label }}</span>
        <template
          v-for="(w, wi) in row.widgets"
          :key="wi"
        >
          <!-- @mousedown.stop: on the canvas surface a widget lives inside a draggable Vue Flow node;
               without this, dragging inside an editor (envelope/waveform curve, xy pad) would drag the
               NODE instead of editing. The bespoke SFCs wrapped their editors the same way. -->
          <div
            v-if="isVisible(w.when)"
            class="nv-widget"
            @mousedown.stop
          >
            <label
              v-if="w.label"
              class="nv-label"
            >{{ w.label }}</label>

            <!-- Primitives → reuse <ControlRenderer> -->
            <ControlRenderer
              v-if="PRIMITIVES.has(w.type) && controlFor(w.bind)"
              :control="controlFor(w.bind) as ControlDefinition"
              :model-value="values[w.bind]"
              :context="controlContext"
              @update="(v) => emit('update', w.bind, v)"
            />

            <!-- Knob -->
            <RotaryKnob
              v-else-if="w.type === 'knob'"
              :model-value="(values[w.bind] as number) ?? num(w, 'default', 0)"
              :min="num(w, 'min', 0)"
              :max="num(w, 'max', 1)"
              :step="num(w, 'step', 0.01)"
              :accent-color="str(w, 'accentColor', 'var(--color-primary-400)')"
              @update:model-value="(v: number) => emit('update', w.bind, v)"
            />

            <!-- Asset picker -->
            <AssetPickerControl
              v-else-if="w.type === 'asset'"
              :model-value="assetValue(w)"
              :asset-type="assetType(w)"
              @update:model-value="(v) => emit('update', w.bind, v)"
            />

            <!-- Connection -->
            <ConnectionSelect
              v-else-if="w.type === 'connection'"
              :model-value="connectionValue(w)"
              :protocol="str(w, 'protocol', 'websocket')"
              @update:model-value="(v) => emit('update', w.bind, v)"
            />

            <!-- Readout (control value or runtime output). A runtime output changes live, so it becomes a
                 named polite status region (announced on change); a static control-value readout stays a
                 plain text span (its content is already in the a11y tree, no live-region spam). -->
            <span
              v-else-if="w.type === 'readout'"
              class="nv-readout"
              :role="w.source === 'output' ? 'status' : undefined"
              :aria-live="w.source === 'output' ? 'polite' : undefined"
              :aria-label="w.source === 'output' && w.label ? `${w.label}: ${readout(w)}` : undefined"
            >{{ readout(w) }}</span>

            <!-- Envelope (Tier-B aggregate: ADSR ↔ 4 flat controls) -->
            <EnvelopeEditor
              v-else-if="w.type === 'env'"
              :model-value="envValue(w)"
              @update:model-value="(v: EnvelopeData) => onEnv(w, v)"
            />

            <!-- Parametric EQ (Tier-B aggregate: 3 bands ↔ 9 flat controls) -->
            <EQEditor
              v-else-if="w.type === 'eq'"
              :model-value="eqValue(w)"
              @update:model-value="(v: EQData) => onEq(w, v)"
            />

            <!-- Wavetable (Tier-B aggregate: samples[] + preset ↔ 2 flat controls) -->
            <WaveformEditor
              v-else-if="w.type === 'wave'"
              :model-value="waveValue(w)"
              @update:model-value="(v: WaveformData) => onWave(w, v)"
            />

            <!-- XY pad (Tier-B aggregate: {x,y} ↔ 2 flat controls) -->
            <XYPad
              v-else-if="w.type === 'xy'"
              :model-value="xyValue(w)"
              @update:model-value="(v: XYValue) => onXy(w, v)"
            />
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.node-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.nv-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.nv-widget {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.nv-row-label,
.nv-label {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.nv-readout {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-primary-500);
}
</style>
