<script setup lang="ts">
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()
</script>

<template>
  <div class="settings-view">
    <div class="settings-container">
      <h1 class="settings-title">
        Settings
      </h1>

      <section class="settings-section">
        <h2 class="section-title">
          Appearance
        </h2>

        <div class="setting-row">
          <label class="setting-label">Theme</label>
          <select
            class="input select"
            :value="uiStore.theme"
            @change="uiStore.setTheme(($event.target as HTMLSelectElement).value as any)"
          >
            <option value="light">
              Light
            </option>
            <option value="dark">
              Dark
            </option>
            <option value="system">
              System
            </option>
          </select>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="section-title">
          Editor
        </h2>

        <div class="setting-row">
          <label class="setting-label">Show Grid</label>
          <input
            type="checkbox"
            :checked="uiStore.showGrid"
            @change="uiStore.toggleGrid()"
          >
        </div>

        <div class="setting-row">
          <label class="setting-label">Snap to Grid</label>
          <input
            type="checkbox"
            :checked="uiStore.snapToGrid"
            @change="uiStore.toggleSnapToGrid()"
          >
        </div>

        <div class="setting-row">
          <label class="setting-label">Grid Size</label>
          <input
            type="number"
            class="input input-sm"
            :value="uiStore.gridSize"
            min="10"
            max="100"
            step="5"
            @change="uiStore.setGridSize(Number(($event.target as HTMLInputElement).value))"
          >
        </div>

        <div class="setting-row">
          <label class="setting-label">Show Minimap</label>
          <input
            type="checkbox"
            :checked="uiStore.showMinimap"
            @change="uiStore.toggleMinimap()"
          >
        </div>
      </section>

      <section class="settings-section">
        <h2 class="section-title">
          About
        </h2>
        <p class="about-text">
          LATCH v0.1.0<br>
          Live Art Tool for Creative Humans<br><br>
          Created by LumenCanvas - 2026
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  width: 100%;
  height: 100%;
  background: var(--color-neutral-100);
  overflow-y: auto;
  padding: var(--space-8);
}

.settings-container {
  max-width: 600px;
  margin: 0 auto;
}

.settings-title {
  font-size: var(--font-size-2xl);
  margin-bottom: var(--space-8);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
}

.settings-section {
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  padding: var(--space-6);
  margin-bottom: var(--space-6);
}

.section-title {
  font-size: var(--font-size-sm);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
  color: var(--color-neutral-500);
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-neutral-200);
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-neutral-100);
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-label {
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
}

.setting-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary-400);
}

.setting-row .input {
  width: 120px;
}

.about-text {
  font-size: var(--font-size-sm);
  color: var(--color-neutral-500);
  line-height: var(--line-height-relaxed);
}
</style>
