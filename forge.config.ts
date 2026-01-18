import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { MakerDMG } from '@electron-forge/maker-dmg'

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Latch',
    executableName: 'latch',
    asar: true,
    icon: './public/icon',
    appBundleId: 'com.lumencanvas.latch',
    appCategoryType: 'public.app-category.developer-tools',
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'latch',
    }),
    new MakerZIP({}, ['darwin', 'linux', 'win32']),
    new MakerDMG({
      format: 'ULFO',
    }),
    new MakerDeb({
      options: {
        maintainer: 'LumenCanvas',
        homepage: 'https://github.com/lumencanvas/latch',
      },
    }),
    new MakerRpm({
      options: {
        homepage: 'https://github.com/lumencanvas/latch',
      },
    }),
  ],
}

export default config
