/**
 * Platform Detection Utilities
 *
 * Detect whether the app is running in Electron or web browser.
 */

import type { Platform } from '@/services/connections/types'

/**
 * Check if running in Electron environment
 */
export function isElectron(): boolean {
  // Check for Electron-specific globals
  if (typeof window !== 'undefined') {
    // Check for electronAPI (preload script)
    if ('electronAPI' in window) {
      return true
    }

    // Check for process.versions.electron
    if (
      typeof process !== 'undefined' &&
      process.versions &&
      'electron' in process.versions
    ) {
      return true
    }

    // Check userAgent (less reliable but fallback)
    if (navigator.userAgent.toLowerCase().includes('electron')) {
      return true
    }
  }

  return false
}

/**
 * Check if running in web browser
 */
export function isWeb(): boolean {
  return !isElectron()
}

/**
 * Get the current platform
 */
export function getPlatform(): Platform {
  return isElectron() ? 'electron' : 'web'
}

/**
 * Check if a feature is available on the current platform
 */
export function isPlatformSupported(platforms: Platform[]): boolean {
  return platforms.includes(getPlatform())
}

/**
 * Platform-specific capabilities
 */
export interface PlatformCapabilities {
  /** UDP sockets available */
  udp: boolean
  /** Full filesystem access */
  filesystem: boolean
  /** Native serial ports (not Web Serial) */
  nativeSerial: boolean
  /** Native MIDI (not Web MIDI) */
  nativeMidi: boolean
  /** Art-Net / sACN support */
  dmx: boolean
  /** mDNS discovery */
  mdns: boolean
  /** CLASP router can run natively */
  nativeClaspRouter: boolean
  /** Web Serial API available */
  webSerial: boolean
  /** Web MIDI API available */
  webMidi: boolean
  /** Web Bluetooth API available */
  webBluetooth: boolean
}

/**
 * Get capabilities for current platform
 */
export function getPlatformCapabilities(): PlatformCapabilities {
  const electron = isElectron()

  return {
    // Electron-only capabilities
    udp: electron,
    filesystem: electron,
    nativeSerial: electron,
    nativeMidi: electron,
    dmx: electron,
    mdns: electron,
    nativeClaspRouter: electron,

    // Web APIs (check availability)
    webSerial: typeof navigator !== 'undefined' && 'serial' in navigator,
    webMidi: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
    webBluetooth: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
  }
}

/**
 * Execute platform-specific code
 */
export function onPlatform<T>(options: {
  electron?: () => T
  web?: () => T
  default?: () => T
}): T | undefined {
  const platform = getPlatform()

  if (platform === 'electron' && options.electron) {
    return options.electron()
  }

  if (platform === 'web' && options.web) {
    return options.web()
  }

  if (options.default) {
    return options.default()
  }

  return undefined
}
