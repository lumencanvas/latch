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
  /** WebGPU available (presence of navigator.gpu; an adapter still needs a check) */
  webgpu: boolean
  /** Camera/microphone capture (getUserMedia) available */
  camera: boolean
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
    webgpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
    camera:
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function',
  }
}

/** User-agent string, or '' outside a browser. */
function userAgent(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
}

/** iOS / iPadOS (incl. iPadOS reporting as desktop Safari with touch). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = userAgent()
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1)
  )
}

export function isAndroid(): boolean {
  return /Android/i.test(userAgent())
}

/** A phone/tablet-class device (web only; Electron is treated as desktop). */
export function isMobile(): boolean {
  if (isElectron()) return false
  return isIOS() || isAndroid() || /Mobi/i.test(userAgent())
}

/** Capability tier used to pick a reduced experience and explain unavailable nodes. */
export type PlatformTier = 'electron' | 'ios-web' | 'android-web' | 'desktop-web'

export function getPlatformTier(): PlatformTier {
  if (isElectron()) return 'electron'
  if (isIOS()) return 'ios-web'
  if (isAndroid()) return 'android-web'
  return 'desktop-web'
}

/** Availability of a capability plus, when missing, why and what to do instead. */
export interface CapabilityStatus {
  available: boolean
  /** Human-readable reason it's unavailable (undefined when available). */
  reason?: string
  /** Suggested alternative (undefined when available). */
  suggestion?: string
}

const USE_BRIDGE = 'Use the desktop app or a CLASP Bridge.'
const USE_DESKTOP = 'Use the desktop app.'

const CAPABILITY_GAPS: Record<keyof PlatformCapabilities, { reason: string; suggestion: string }> = {
  webSerial: { reason: "Web Serial isn't available in this browser.", suggestion: USE_BRIDGE },
  webMidi: { reason: "Web MIDI isn't available in this browser.", suggestion: USE_BRIDGE },
  webBluetooth: { reason: "Web Bluetooth isn't available in this browser.", suggestion: USE_BRIDGE },
  webgpu: {
    reason: "WebGPU isn't available in this browser.",
    suggestion: 'Use a Chromium-based browser (Chrome/Edge) or the desktop app.',
  },
  camera: {
    reason: 'Camera/microphone access is unavailable.',
    suggestion: 'Grant permission, or use a supported browser over HTTPS.',
  },
  udp: { reason: 'UDP sockets require the desktop app.', suggestion: USE_BRIDGE },
  filesystem: { reason: 'Full filesystem access requires the desktop app.', suggestion: USE_DESKTOP },
  nativeSerial: { reason: 'Native serial requires the desktop app.', suggestion: USE_BRIDGE },
  nativeMidi: { reason: 'Native MIDI requires the desktop app.', suggestion: USE_BRIDGE },
  dmx: { reason: 'Art-Net / sACN (DMX) requires the desktop app.', suggestion: USE_BRIDGE },
  mdns: { reason: 'mDNS discovery requires the desktop app.', suggestion: USE_DESKTOP },
  nativeClaspRouter: { reason: 'The native CLASP router requires the desktop app.', suggestion: USE_DESKTOP },
}

/**
 * Status of a single capability on the current platform — so a node can render a
 * clear "unavailable here, do X instead" state rather than failing silently.
 */
export function getCapabilityStatus(capability: keyof PlatformCapabilities): CapabilityStatus {
  if (getPlatformCapabilities()[capability]) return { available: true }
  const gap = CAPABILITY_GAPS[capability]
  return { available: false, reason: gap.reason, suggestion: gap.suggestion }
}

/**
 * Whether the user has requested reduced motion at the OS level. Nodes and the
 * render loop can honor this to limit animation (accessibility + battery).
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Clamp the device pixel ratio for renderer surfaces. Rendering at the full DPR
 * of a high-density display is expensive; capping trades a little sharpness for
 * a lot of GPU/battery headroom (use ~1.5 on phones, ~2 on desktop).
 */
export function clampDevicePixelRatio(max: number = 2): number {
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1
  return Math.min(dpr, max)
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
