<script setup lang="ts">
/**
 * ProtocolFormFields
 *
 * Dynamically renders form controls based on a connection type definition's configControls.
 * Fields flow into a two-column grid; long fields (URLs, selects, textareas, checkboxes)
 * span the full width while short fields (host/port, user/pass, numbers) pair up.
 */

import { computed } from 'vue'
import type { ControlDefinition } from '@/stores/nodes'

// Extended control definition for connection forms with conditional visibility
interface ConnectionFormControl extends Omit<ControlDefinition, 'props'> {
  props?: {
    type?: string
    placeholder?: string
    min?: number
    max?: number
    step?: number
    rows?: number
    options?: Array<{ value: string | number; label: string }>
  }
  showIf?: {
    field: string
    value?: unknown
    values?: unknown[]
  }
}

const props = defineProps<{
  /** Control definitions from the connection type */
  controls: ConnectionFormControl[]
  /** Current form values */
  values: Record<string, unknown>
}>()

const emit = defineEmits<{
  (e: 'update:values', values: Record<string, unknown>): void
}>()

function updateValue(controlId: string, value: unknown) {
  emit('update:values', {
    ...props.values,
    [controlId]: value,
  })
}

function getValue(control: ConnectionFormControl) {
  return props.values[control.id] ?? control.default
}

// Long-form fields take the whole row; short scalar inputs (text/number) pair up
// into two columns. Keeps related pairs — host/port, user/password — side by side.
function isWide(control: ConnectionFormControl): boolean {
  if (control.type === 'textarea' || control.type === 'select' || control.type === 'checkbox') {
    return true
  }
  return /url/i.test(control.id)
}

const visibleControls = computed(() => {
  return props.controls.filter((control) => {
    // Check visibility conditions if defined
    if (control.showIf) {
      const conditionValue = props.values[control.showIf.field]
      if (Array.isArray(control.showIf.values)) {
        return control.showIf.values.includes(conditionValue)
      }
      return conditionValue === control.showIf.value
    }
    return true
  })
})
</script>

<template>
  <div class="form-fields">
    <template
      v-for="control in visibleControls"
      :key="control.id"
    >
      <!-- Checkbox: inline label, no stacked header -->
      <label
        v-if="control.type === 'checkbox'"
        class="form-field is-wide checkbox-field"
      >
        <input
          type="checkbox"
          :checked="Boolean(getValue(control))"
          class="field-checkbox"
          @change="(e) => updateValue(control.id, (e.target as HTMLInputElement).checked)"
        >
        <span class="checkbox-text">
          {{ control.label }}
          <span
            v-if="control.description"
            class="checkbox-description"
          >{{ control.description }}</span>
        </span>
      </label>

      <!-- Everything else: stacked label + input -->
      <div
        v-else
        class="form-field"
        :class="{ 'is-wide': isWide(control) }"
      >
        <label
          :for="`field-${control.id}`"
          class="field-label"
        >
          {{ control.label }}
        </label>

        <!-- Text input -->
        <input
          v-if="control.type === 'text'"
          :id="`field-${control.id}`"
          :type="control.props?.type || 'text'"
          :value="getValue(control)"
          :placeholder="control.props?.placeholder"
          class="field-input"
          @input="(e) => updateValue(control.id, (e.target as HTMLInputElement).value)"
        >

        <!-- Number input -->
        <input
          v-else-if="control.type === 'number'"
          :id="`field-${control.id}`"
          type="number"
          :value="getValue(control)"
          :min="control.props?.min"
          :max="control.props?.max"
          :step="control.props?.step || 1"
          class="field-input"
          @input="(e) => updateValue(control.id, Number((e.target as HTMLInputElement).value))"
        >

        <!-- Select -->
        <select
          v-else-if="control.type === 'select'"
          :id="`field-${control.id}`"
          :value="getValue(control)"
          class="field-select"
          @change="(e) => updateValue(control.id, (e.target as HTMLSelectElement).value)"
        >
          <option
            v-for="option in control.props?.options || []"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>

        <!-- Textarea -->
        <textarea
          v-else-if="control.type === 'textarea'"
          :id="`field-${control.id}`"
          :value="getValue(control) as string"
          :rows="control.props?.rows || 3"
          :placeholder="control.props?.placeholder"
          class="field-textarea"
          @input="(e) => updateValue(control.id, (e.target as HTMLTextAreaElement).value)"
        />

        <!-- Description -->
        <span
          v-if="control.description"
          class="field-description"
        >
          {{ control.description }}
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.form-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.form-field.is-wide {
  grid-column: 1 / -1;
}

.field-label {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-neutral-500);
}

.field-input,
.field-select,
.field-textarea {
  width: 100%;
  padding: var(--space-2);
  background: var(--color-neutral-50);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-900);
  transition: border-color var(--transition-fast);
}

.field-input:hover,
.field-select:hover,
.field-textarea:hover {
  border-color: var(--color-neutral-300);
}

.field-input:focus,
.field-select:focus,
.field-textarea:focus {
  outline: none;
  border-color: var(--color-primary-500);
}

.field-input::placeholder,
.field-textarea::placeholder {
  color: var(--color-neutral-400);
}

.field-select {
  appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right var(--space-2) center;
  padding-right: var(--space-6);
}

.field-textarea {
  resize: vertical;
  min-height: 72px;
  line-height: 1.5;
}

.field-description {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  line-height: 1.4;
}

/* Checkbox field — inline switch + label */
.checkbox-field {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: var(--space-2);
  cursor: pointer;
}

.field-checkbox {
  margin-top: 2px;
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary-500);
  cursor: pointer;
  flex-shrink: 0;
}

.checkbox-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
}

.checkbox-description {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  line-height: 1.4;
}
</style>
