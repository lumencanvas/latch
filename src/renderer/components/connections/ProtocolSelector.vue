<script setup lang="ts">
/**
 * ProtocolSelector
 *
 * A grid of protocol type cards for selecting which type of connection to create.
 */

import { computed, type Component } from 'vue'
import { storeToRefs } from 'pinia'
import { ChevronRight, Plug, Radio, RadioTower, Globe, Cable, Bluetooth, Usb } from 'lucide-vue-next'
import { useConnectionsStore } from '@/stores/connections'
import { isElectron } from '@/utils/platform'
import type { ConnectionTypeDefinition } from '@/services/connections/types'

// Icon mapping for dynamic icons
const iconMap: Record<string, Component> = {
  plug: Plug,
  radio: Radio,
  'radio-tower': RadioTower,
  globe: Globe,
  cable: Cable,
  bluetooth: Bluetooth,
  usb: Usb,
}

function getIconComponent(iconName: string): Component {
  return iconMap[iconName] || Plug
}

const emit = defineEmits<{
  (e: 'select', typeDef: ConnectionTypeDefinition): void
}>()

const connectionsStore = useConnectionsStore()
const { types: connectionTypes } = storeToRefs(connectionsStore)

// Group connection types by category
const typesByCategory = computed(() => {
  const platform = isElectron() ? 'electron' : 'web'
  const availableTypes = connectionTypes.value.filter(
    (t: ConnectionTypeDefinition) => !t.platforms || t.platforms.includes(platform)
  )

  const grouped: Record<string, ConnectionTypeDefinition[]> = {}
  for (const typeDef of availableTypes) {
    const category = typeDef.category || 'other'
    if (!grouped[category]) {
      grouped[category] = []
    }
    grouped[category].push(typeDef)
  }
  return grouped
})

const categoryLabels: Record<string, string> = {
  protocol: 'Protocols',
  hardware: 'Hardware',
  service: 'Services',
  other: 'Other',
}

function getCategoryLabel(category: string) {
  return categoryLabels[category] || category
}

function selectType(typeDef: ConnectionTypeDefinition) {
  emit('select', typeDef)
}
</script>

<template>
  <div class="protocol-selector">
    <template
      v-for="(types, category) in typesByCategory"
      :key="category"
    >
      <div class="category-section">
        <h3 class="category-label">
          {{ getCategoryLabel(category) }}
        </h3>
        <div class="protocol-grid">
          <button
            v-for="typeDef in types"
            :key="typeDef.id"
            class="protocol-card"
            @click="selectType(typeDef)"
          >
            <div
              class="protocol-icon"
              :style="{ backgroundColor: typeDef.color + '20', color: typeDef.color }"
            >
              <component :is="getIconComponent(typeDef.icon)" />
            </div>
            <div class="protocol-info">
              <span class="protocol-name">{{ typeDef.name }}</span>
              <span
                v-if="typeDef.description"
                class="protocol-description"
              >
                {{ typeDef.description }}
              </span>
            </div>
            <ChevronRight class="protocol-arrow" />
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.protocol-selector {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.category-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.category-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--color-neutral-500);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
  padding: 0 var(--space-2);
}

.protocol-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.protocol-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: white;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.protocol-card:hover {
  background: var(--color-neutral-50);
  border-color: var(--color-neutral-300);
}

.protocol-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.protocol-icon svg {
  width: 20px;
  height: 20px;
}

.protocol-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-0-5);
  min-width: 0;
}

.protocol-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-neutral-800);
}

.protocol-description {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.protocol-arrow {
  width: 16px;
  height: 16px;
  color: var(--color-neutral-400);
  flex-shrink: 0;
}
</style>
