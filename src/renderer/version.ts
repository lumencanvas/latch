// Single source of truth for the displayed app version. Read from package.json at
// build time so the UI version can never drift from the released version again.
import { version } from '../../package.json'

export const APP_VERSION = version
