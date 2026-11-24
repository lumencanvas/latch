import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'

// Sign only when the release workflow provides an identity (it imports the
// Developer ID cert and sets APPLE_TEAM_ID). Unsigned local builds get an ad-hoc
// signature re-applied by the fuses plugin on arm64.
const shouldSign = Boolean(process.env.APPLE_TEAM_ID)

const macEntitlements = resolve(import.meta.dirname, 'src/main/entitlements.mac.plist')

/**
 * Package an allowlist instead of a denylist: the app is `package.json` + the
 * electron-vite output. Main/preload only use `electron` + Node builtins (deps are
 * bundled), so node_modules (onnxruntime-node, sharp, …) is never shipped.
 */
function ignore(path: string): boolean {
  if (path === '' || path === '/package.json') return false
  if (path === '/dist-electron' || path.startsWith('/dist-electron/')) return path.endsWith('.map')
  return true
}

const APP_BUNDLE_ID = 'com.lumencanvas.latch'

const config: ForgeConfig = {
  hooks: {
    // Unsigned macOS builds: the fuses plugin re-applies an ad-hoc signature, but it keeps
    // Electron's signing identifier (`com.github.Electron`). macOS privacy (TCC) keys camera /
    // mic / Bluetooth grants on the code signature, so the mismatch with our bundle id made the
    // camera silently unavailable (no prompt). Re-sign the bundle ad-hoc as LATCH itself.
    postPackage: async (_config, { platform, outputPaths }) => {
      if (platform !== 'darwin' || shouldSign) return
      for (const out of outputPaths) {
        const app = join(out, 'LATCH.app')
        // Nested helpers/frameworks first (each under its own bundle id — their Info.plists were
        // edited after Electron's signature, so they fail `codesign --verify` as shipped)…
        execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
        // …then the outer bundle as LATCH, with the device entitlements.
        execFileSync('codesign', [
          '--force', '--sign', '-', '--identifier', APP_BUNDLE_ID,
          '--entitlements', macEntitlements, app,
        ], { stdio: 'inherit' })
      }
    },
  },
  packagerConfig: {
    name: 'LATCH',
    executableName: 'latch',
    asar: true,
    prune: false,
    ignore,
    icon: './public/icon',
    appBundleId: APP_BUNDLE_ID,
    appCategoryType: 'public.app-category.developer-tools',
    darwinDarkModeSupport: true,
    extendInfo: {
      NSCameraUsageDescription: 'LATCH nodes can use the camera as a live video source.',
      NSMicrophoneUsageDescription: 'LATCH nodes can use the microphone for audio input and analysis.',
      NSBluetoothAlwaysUsageDescription: 'LATCH connects to Bluetooth LE devices you choose (sensors, controllers, printers).',
    },
    ...(shouldSign && {
      osxSign: {
        optionsForFile: () => ({
          hardenedRuntime: true,
          entitlements: macEntitlements,
        }),
      },
    }),
    ...(process.env.APPLE_ID &&
      process.env.APPLE_PASSWORD &&
      process.env.APPLE_TEAM_ID && {
        osxNotarize: {
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_PASSWORD,
          teamId: process.env.APPLE_TEAM_ID,
        },
      }),
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'LATCH',
    }),
    new MakerZIP({}, ['darwin', 'linux', 'win32']),
    new MakerDMG({
      format: 'ULFO',
      name: 'LATCH',
    }),
    new MakerDeb({
      options: {
        name: 'latch',
        productName: 'LATCH',
        maintainer: 'LumenCanvas',
        homepage: 'https://github.com/lumencanvas/latch',
      },
    }),
    // No RPM maker: electron-installer-redhat's spec breaks on rpm >= 4.20 (CI's ubuntu runner:
    // "cp: cannot stat 'usr/*'" in %install), and the release never published an .rpm anyway.
  ],
  plugins: [
    // Flipped at package time, before signing.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      // Must stay ON: releases <= 1.2.x stored every flow in the file:// origin, and the one-time
      // migration (src/main/storageMigration.ts) reads it from a hidden file:// page. With this
      // fuse off, file:// pages get "Access is denied" on localStorage/IndexedDB and desktop users
      // would lose their flows. The renderer itself never loads file:// and navigation guards
      // (security.ts) block navigating to it, so the exposure stays limited to that hidden page.
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
    }),
  ],
}

export default config
