<script setup lang="ts">
import { computed, watch, ref, nextTick, onUnmounted } from 'vue'
import { ChevronDown, Plus, Pencil } from 'lucide-vue-next'
import { useConnectionsStore } from '@/stores/connections'
import type { HttpConnectionConfig, HttpEndpointTemplate } from '@/services/connections/types'

const props = defineProps<{
  modelValue: string | undefined
  connectionId: string | undefined
  allowInline?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'edit-template', templateId: string): void
  (e: 'add-template'): void
}>()

const connectionsStore = useConnectionsStore()

// Get templates from the selected connection
const templates = computed<HttpEndpointTemplate[]>(() => {
  if (!props.connectionId) return []

  const connection = connectionsStore.connections.find(
    (c) => c.id === props.connectionId
  ) as HttpConnectionConfig | undefined

  return connection?.templates ?? []
})

// Get the selected template
const selectedTemplate = computed(() => {
  if (!props.modelValue) return null
  return templates.value.find((t) => t.id === props.modelValue) ?? null
})

// Dropdown open state
const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)

// Return keyboard focus to the trigger after the dropdown closes (the trigger now
// shows the chosen value, so it is the natural landing spot).
function refocusTrigger() {
  nextTick(() => triggerRef.value?.focus())
}

function selectTemplate(templateId: string) {
  emit('update:modelValue', templateId)
  isOpen.value = false
  refocusTrigger()
}

function selectInline() {
  emit('update:modelValue', '')
  isOpen.value = false
  refocusTrigger()
}

function closeAndRefocus() {
  isOpen.value = false
  refocusTrigger()
}

// Listbox keyboard model (WCAG 2.1.1). role="listbox" promises arrow-key
// navigation between its options; drive DOM focus across the option buttons so
// the promise is honoured. Options stay individually Tab-reachable so each row's
// edit affordance remains operable.
function optionEls(): HTMLElement[] {
  return dropdownRef.value
    ? Array.from(dropdownRef.value.querySelectorAll<HTMLElement>('[role="option"]'))
    : []
}

function focusOptionAt(index: number) {
  const els = optionEls()
  if (!els.length) return
  els[(index + els.length) % els.length]?.focus()
}

function onListboxKeydown(e: KeyboardEvent) {
  const els = optionEls()
  // The handler is bound to the whole dropdown, so keydown also bubbles from the
  // Tab-reachable edit/add buttons, which are not options → indexOf is -1. Land on
  // the first option for ArrowDown and the last for ArrowUp in that case.
  const current = els.indexOf(document.activeElement as HTMLElement)
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      focusOptionAt(current < 0 ? 0 : current + 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      focusOptionAt(current < 0 ? els.length - 1 : current - 1)
      break
    case 'Home':
      e.preventDefault()
      focusOptionAt(0)
      break
    case 'End':
      e.preventDefault()
      focusOptionAt(els.length - 1)
      break
  }
}

function handleEdit(e: Event, templateId: string) {
  e.stopPropagation()
  emit('edit-template', templateId)
}

function handleAdd(e: Event) {
  e.stopPropagation()
  emit('add-template')
  isOpen.value = false
}

// Close dropdown when clicking outside
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.template-select')) {
    isOpen.value = false
  }
}

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('click', handleClickOutside)
    // Move focus onto the selected option (or the first) once the list renders.
    nextTick(() => {
      const els = optionEls()
      const selected = els.findIndex((el) => el.getAttribute('aria-selected') === 'true')
      focusOptionAt(selected >= 0 ? selected : 0)
    })
  } else {
    document.removeEventListener('click', handleClickOutside)
  }
})

// Safety net: if the component unmounts while the dropdown is open, the watcher
// never fires its close branch — remove the document listener so it can't dangle.
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div
    class="template-select"
    @keydown.escape="closeAndRefocus"
  >
    <button
      ref="triggerRef"
      class="template-select-trigger"
      :class="{ open: isOpen, empty: !selectedTemplate && !modelValue }"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      <span class="trigger-label">
        <template v-if="selectedTemplate">
          <span
            class="method-badge"
            :class="selectedTemplate.method.toLowerCase()"
          >
            {{ selectedTemplate.method }}
          </span>
          {{ selectedTemplate.name }}
        </template>
        <template v-else-if="modelValue === ''">
          Inline Configuration
        </template>
        <template v-else>
          {{ placeholder ?? 'Select template...' }}
        </template>
      </span>
      <ChevronDown
        :size="14"
        class="chevron"
      />
    </button>

    <div
      v-if="isOpen"
      ref="dropdownRef"
      class="template-dropdown"
      role="listbox"
      aria-label="HTTP request template"
      @keydown="onListboxKeydown"
    >
      <!-- Inline option -->
      <button
        v-if="allowInline"
        class="template-option inline-option"
        role="option"
        :aria-selected="modelValue === ''"
        :class="{ selected: modelValue === '' }"
        @click="selectInline"
      >
        Inline Configuration
      </button>

      <!-- Separator -->
      <div
        v-if="allowInline && templates.length > 0"
        class="dropdown-separator"
      />

      <!-- Templates -->
      <div
        v-for="template in templates"
        :key="template.id"
        class="template-option-row"
        :class="{ selected: template.id === modelValue }"
      >
        <button
          type="button"
          class="template-option"
          role="option"
          :aria-selected="template.id === modelValue"
          @click="selectTemplate(template.id)"
        >
          <span
            class="method-badge"
            :class="template.method.toLowerCase()"
          >
            {{ template.method }}
          </span>
          <span class="template-name">{{ template.name }}</span>
          <span class="template-path">{{ template.path }}</span>
        </button>
        <button
          type="button"
          class="edit-btn"
          :aria-label="`Edit template ${template.name}`"
          @click.stop="handleEdit($event, template.id)"
        >
          <Pencil :size="12" />
        </button>
      </div>

      <!-- Empty state -->
      <div
        v-if="templates.length === 0 && !allowInline"
        class="empty-state"
      >
        No templates configured
      </div>

      <!-- Add button -->
      <button
        class="add-template-btn"
        @click="handleAdd"
      >
        <Plus :size="14" />
        Add Template
      </button>
    </div>
  </div>
</template>

<style scoped>
.template-select {
  position: relative;
  width: 100%;
}

.template-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-2);
  background: var(--color-neutral-50);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-900);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.template-select-trigger:hover {
  border-color: var(--color-neutral-300);
}

.template-select-trigger.open {
  border-color: var(--color-primary-400);
}

.template-select-trigger.empty {
  color: var(--color-neutral-400);
}

.trigger-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  flex-shrink: 0;
  color: var(--color-neutral-400);
  transition: transform var(--transition-fast);
}

.template-select-trigger.open .chevron {
  transform: rotate(180deg);
}

.template-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  max-height: 300px;
  overflow-y: auto;
}

.template-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: none;
  border: none;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition-fast);
}

.template-option:hover,
.inline-option:hover {
  background: var(--color-neutral-50);
}

.template-option.selected,
.inline-option.selected {
  background: var(--color-primary-50);
  color: var(--color-primary-700);
}

.template-option:focus-visible,
.inline-option:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: -2px;
}

.template-option.inline-option {
  font-style: italic;
  color: var(--color-neutral-500);
}

/* Template rows pair a select button with an edit button as siblings. */
.template-option-row {
  display: flex;
  align-items: center;
  transition: background var(--transition-fast);
}

.template-option-row:hover {
  background: var(--color-neutral-50);
}

.template-option-row.selected {
  background: var(--color-primary-50);
}

.template-option-row.selected .template-option {
  background: transparent;
  color: var(--color-primary-700);
}

.template-option-row .template-option {
  flex: 1;
  min-width: 0;
}

.template-option-row .template-option:hover {
  background: transparent;
}

.method-badge {
  flex-shrink: 0;
  padding: 1px 4px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  border-radius: 2px;
  text-transform: uppercase;
}

.method-badge.get {
  background: var(--color-success-100);
  color: var(--color-success-700);
}

.method-badge.post {
  background: var(--color-primary-100);
  color: var(--color-primary-700);
}

.method-badge.put {
  background: var(--color-warning-100);
  color: var(--color-warning-700);
}

.method-badge.patch {
  background: #FEF3C7;
  color: #92400E;
}

.method-badge.delete {
  background: var(--color-error-100);
  color: var(--color-error-700);
}

.template-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-path {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-400);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: var(--color-neutral-100);
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-neutral-500);
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition-fast);
}

.template-option-row:hover .edit-btn,
.template-option-row:focus-within .edit-btn,
.edit-btn:focus-visible {
  opacity: 1;
}

.edit-btn:hover {
  background: var(--color-neutral-200);
  color: var(--color-neutral-700);
}

.edit-btn:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: -2px;
}

.dropdown-separator {
  height: 1px;
  background: var(--color-neutral-100);
  margin: var(--space-1) 0;
}

.empty-state {
  padding: var(--space-3);
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-400);
}

.add-template-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  width: 100%;
  padding: var(--space-2);
  background: none;
  border: none;
  border-top: 1px solid var(--color-neutral-100);
  font-size: var(--font-size-sm);
  color: var(--color-primary-600);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.add-template-btn:hover {
  background: var(--color-primary-50);
}
</style>
