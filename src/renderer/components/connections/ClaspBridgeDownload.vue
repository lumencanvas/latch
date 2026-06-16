<script setup lang="ts">
/**
 * ClaspBridgeDownload
 *
 * Shows download links for the CLASP Bridge application.
 * CLASP Bridge provides OSC, MIDI, and Serial bridging to the browser.
 */

import { Cable, Download, Monitor, Apple, Terminal } from 'lucide-vue-next'

const BRIDGE_DOWNLOAD_URL = 'https://github.com/lumencanvas/clasp-bridge/releases'

function openDownloadPage() {
  window.open(BRIDGE_DOWNLOAD_URL, '_blank')
}
</script>

<template>
  <div class="clasp-bridge-download">
    <div class="bridge-icon">
      <Cable :size="24" />
    </div>

    <div class="bridge-info">
      <h4 class="bridge-title">
        CLASP Bridge
      </h4>
      <p class="bridge-description">
        Bridge MIDI, Serial, and OSC protocols from your system to Latch.
      </p>
    </div>

    <div class="platform-icons">
      <span
        class="platform-icon"
        title="Windows"
      >
        <Monitor :size="16" />
      </span>
      <span
        class="platform-icon"
        title="macOS"
      >
        <Apple :size="16" />
      </span>
      <span
        class="platform-icon"
        title="Linux"
      >
        <Terminal :size="16" />
      </span>
    </div>

    <button
      class="download-btn"
      @click="openDownloadPage"
    >
      <Download :size="16" />
      Download
    </button>
  </div>
</template>

<style scoped>
.clasp-bridge-download {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  background: linear-gradient(
    135deg,
    var(--color-primary-100) 0%,
    var(--color-neutral-50) 100%
  );
  border-radius: var(--radius-md);
  border: 1px solid var(--color-primary-200);
  text-align: center;
}

.bridge-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: var(--color-primary-600);
  border-radius: var(--radius-md);
  color: white;
}

.bridge-icon svg {
  width: 24px;
  height: 24px;
}

.bridge-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.bridge-title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-neutral-800);
}

.bridge-description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-600);
  max-width: 300px;
}

.platform-icons {
  display: flex;
  gap: var(--space-3);
}

.platform-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--color-neutral-500);
  opacity: 0.7;
}

.platform-icon svg {
  width: 16px;
  height: 16px;
}

.download-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-primary-600);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: background 0.15s ease;
}

.download-btn:hover {
  background: var(--color-primary-500);
}

.download-btn svg {
  width: 16px;
  height: 16px;
}
</style>
