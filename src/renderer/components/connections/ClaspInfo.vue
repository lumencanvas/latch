<script setup lang="ts">
/**
 * ClaspInfo
 *
 * Informational component explaining CLASP Router and CLASP Bridge.
 * Shown on the CLASP connection configuration page.
 */

import { Info, ExternalLink, Cable, ChevronDown } from 'lucide-vue-next'

const CLASP_DOCS_URL = 'https://github.com/lumencanvas/clasp'
const BRIDGE_DOWNLOAD_URL = 'https://github.com/lumencanvas/clasp-bridge/releases'

function openDocs() {
  window.open(CLASP_DOCS_URL, '_blank')
}

function openBridgeDownload() {
  window.open(BRIDGE_DOWNLOAD_URL, '_blank')
}
</script>

<template>
  <details class="clasp-info">
    <summary class="info-header">
      <Info
        :size="16"
        class="info-icon"
      />
      <span class="info-title">About CLASP</span>
      <ChevronDown
        :size="14"
        class="info-chevron"
      />
    </summary>

    <div class="info-body">
      <p class="info-text">
        CLASP (Creative Low-latency Application Streaming Protocol) is a real-time
        messaging protocol for creative applications. Connect to a CLASP Router to
        send and receive signals between Latch and other CLASP-enabled applications.
      </p>

      <div class="info-links">
        <button
          class="info-link"
          @click="openDocs"
        >
          <ExternalLink :size="14" />
          CLASP Documentation
        </button>
      </div>

      <div class="bridge-callout">
        <Cable
          :size="18"
          class="bridge-icon"
        />
        <div class="bridge-content">
          <span class="bridge-label">Need MIDI, OSC, or Serial?</span>
          <span class="bridge-text">
            Use <button
              class="inline-link"
              @click="openBridgeDownload"
            >CLASP Bridge</button>
            to connect hardware devices and protocols to Latch via CLASP.
          </span>
        </div>
      </div>
    </div>
  </details>
</template>

<style scoped>
.clasp-info {
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-neutral-200);
}

/* Collapsed by default — just a one-line header until the user expands it. */
.info-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.info-header::-webkit-details-marker {
  display: none;
}

.info-chevron {
  margin-left: auto;
  color: var(--color-neutral-400);
  transition: transform var(--transition-fast);
}

.clasp-info[open] .info-chevron {
  transform: rotate(180deg);
}

.info-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.info-icon {
  color: var(--color-primary-500);
}

.info-title {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-neutral-600);
}

.info-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-600);
  line-height: 1.5;
}

.info-links {
  display: flex;
  gap: var(--space-2);
}

.info-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: white;
  border: 1px solid var(--color-neutral-300);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  color: var(--color-primary-600);
  cursor: pointer;
  transition: all 0.15s ease;
}

.info-link:hover {
  border-color: var(--color-primary-400);
  background: var(--color-primary-50);
}

.bridge-callout {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-primary-50);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-primary-200);
}

.bridge-icon {
  color: var(--color-primary-500);
  flex-shrink: 0;
  margin-top: 2px;
}

.bridge-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.bridge-label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-neutral-700);
}

.bridge-text {
  font-size: var(--font-size-sm);
  color: var(--color-neutral-600);
  line-height: 1.4;
}

.inline-link {
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
  font-weight: 600;
  color: var(--color-primary-600);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.inline-link:hover {
  color: var(--color-primary-500);
}
</style>
