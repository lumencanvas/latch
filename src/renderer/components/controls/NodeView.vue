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

function envValue(w: UIWidget): EnvelopeData {
  const fields = aggregateFields(w)
  // A field absent from `values` falls back to its control's declared default (mirrors the bespoke
  // node's per-field defaults), then 0 — never a uniform 0 that would collapse attack/decay.
  const at = (i: number): number => {
    const v = props.values[fields[i]]
    if (typeof v === 'number') return v
    const def = controlFor(fields[i])?.default
    return typeof def === 'number' ? def : 0
  }
  return { attack: at(0), decay: at(1), sustain: at(2), release: at(3) }
}

function onEnv(w: UIWidget, data: EnvelopeData): void {
  const fields = aggregateFields(w)
  ENV_ORDER.forEach((k, i) => {
    if (fields[i]) emit('update', fields[i], data[k])
  })
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
          <div
            v-if="isVisible(w.when)"
            class="nv-widget"
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

            <!-- Readout (control value or runtime output) -->
            <span
              v-else-if="w.type === 'readout'"
              class="nv-readout"
            >{{ readout(w) }}</span>

            <!-- Envelope (Tier-B aggregate: ADSR ↔ 4 flat controls) -->
            <EnvelopeEditor
              v-else-if="w.type === 'env'"
              :model-value="envValue(w)"
              @update:model-value="(v: EnvelopeData) => onEnv(w, v)"
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
