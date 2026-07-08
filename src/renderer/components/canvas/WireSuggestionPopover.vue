<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { fuzzySearch } from '@/utils/fuzzySearch'
import type { SuggestionPort } from '@/utils/nodeSuggestions'

export interface SuggestionItem {
  nodeType: string
  name: string
  color: string
  port: SuggestionPort
}

const props = defineProps<{
  items: SuggestionItem[]
  x: number
  y: number
  originTypeLabel: string
  originGlyph: string
  originColor: string
}>()

const emit = defineEmits<{
  pick: [item: SuggestionItem]
  close: []
}>()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)

const filtered = computed(() => {
  const q = query.value.trim()
  if (!q) return props.items
  return fuzzySearch(props.items, q, (i) => [i.name, i.nodeType]).map((r) => r.item)
})

// The active option resets to the top whenever the filtered set changes so the
// aria-activedescendant highlight can never point past the end of the list.
watch(filtered, () => { activeIndex.value = 0 })

const activeId = computed(() => {
  const item = filtered.value[activeIndex.value]
  return item ? `wire-sugg-opt-${item.nodeType}` : undefined
})

// Keep the highlighted option visible when arrowing through a long list.
watch(activeIndex, () => {
  nextTick(() => {
    if (activeId.value) document.getElementById(activeId.value)?.scrollIntoView?.({ block: 'nearest' })
  })
})

function move(delta: number) {
  const n = filtered.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
}

function pickActive() {
  const item = filtered.value[activeIndex.value]
  if (item) emit('pick', item)
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); move(1); break
    case 'ArrowUp': event.preventDefault(); move(-1); break
    case 'Home': event.preventDefault(); activeIndex.value = 0; break
    case 'End': event.preventDefault(); activeIndex.value = Math.max(0, filtered.value.length - 1); break
    case 'Enter': event.preventDefault(); pickActive(); break
    case 'Escape': event.preventDefault(); emit('close'); break
  }
}

// A popover is non-modal: it closes when focus leaves it (Tab-away) or on a
// pointer-down anywhere outside. Focus moves to the search box on open and is
// returned to the canvas by the parent on close.
function onFocusout(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (next && rootRef.value?.contains(next)) return
  nextTick(() => {
    if (!rootRef.value?.contains(document.activeElement)) emit('close')
  })
}

function onDocPointerDown(event: PointerEvent) {
  if (!rootRef.value?.contains(event.target as Node)) emit('close')
}

onMounted(() => {
  nextTick(() => inputRef.value?.focus())
  // Deferred so the pointer-up that opened the popover doesn't immediately close it.
  setTimeout(() => document.addEventListener('pointerdown', onDocPointerDown), 0)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown))
</script>

<template>
  <div
    ref="rootRef"
    class="wire-suggest"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @keydown="onKeydown"
    @focusout="onFocusout"
  >
    <div class="ws-header">
      Add a node that accepts
      <span
        class="ws-type"
        :style="{ color: originColor }"
      >{{ originGlyph }} {{ originTypeLabel }}</span>
    </div>
    <input
      ref="inputRef"
      v-model="query"
      type="text"
      class="ws-input"
      role="combobox"
      aria-expanded="true"
      aria-controls="wire-sugg-listbox"
      :aria-activedescendant="activeId"
      :aria-label="`Search nodes that accept ${originTypeLabel}`"
      placeholder="Search…"
    >
    <ul
      id="wire-sugg-listbox"
      class="ws-list"
      role="listbox"
      :aria-label="`Nodes that accept ${originTypeLabel}`"
    >
      <li
        v-for="(item, i) in filtered"
        :id="`wire-sugg-opt-${item.nodeType}`"
        :key="item.nodeType"
        class="ws-opt"
        :class="{ active: i === activeIndex }"
        role="option"
        :aria-selected="i === activeIndex"
        @mousedown.prevent
        @click="emit('pick', item)"
        @mouseenter="activeIndex = i"
      >
        <span
          class="ws-dot"
          :style="{ background: item.color }"
        />
        <span class="ws-name">{{ item.name }}</span>
      </li>
      <li
        v-if="filtered.length === 0"
        class="ws-empty"
      >
        No compatible nodes
      </li>
    </ul>
  </div>
</template>

<style scoped>
.wire-suggest {
  position: fixed;
  z-index: 9998;
  width: 240px;
  display: flex;
  flex-direction: column;
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-800);
  box-shadow: 3px 3px 0 0 var(--color-neutral-800);
  font-family: var(--font-mono);
}

.ws-header {
  padding: var(--space-2) var(--space-3);
  font-size: 10px;
  color: var(--color-neutral-500);
  border-bottom: 1px solid var(--color-neutral-200);
}

.ws-type {
  font-weight: var(--font-weight-bold);
}

.ws-input {
  border: none;
  outline: none;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-mono);
  font-size: 12px;
  background: transparent;
  color: var(--color-neutral-800);
  border-bottom: 1px solid var(--color-neutral-200);
}

.ws-input:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: -2px;
}

.ws-list {
  list-style: none;
  margin: 0;
  padding: var(--space-1);
  max-height: 260px;
  overflow-y: auto;
}

.ws-opt {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  cursor: pointer;
  font-size: 12px;
  color: var(--color-neutral-800);
}

.ws-opt.active {
  background: var(--color-neutral-100);
}

.ws-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ws-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-empty {
  padding: var(--space-3);
  text-align: center;
  font-size: 11px;
  color: var(--color-neutral-400);
}
</style>
