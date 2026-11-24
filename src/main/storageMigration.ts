/**
 * One-time migration of renderer storage from the old `file://` origin to `app://latch`.
 *
 * Releases up to 1.2.x loaded the renderer with `loadFile()`, so every saved flow, asset
 * record, Control Panel layout and preference lives in the `file://` origin's localStorage
 * and IndexedDB. Since the renderer moved to the privileged `app://` scheme (needed for
 * cross-origin isolation), that origin is different and the data would silently vanish
 * on upgrade.
 *
 * On first launch we open a hidden window on a `file://` page (same session → same
 * storage), dump localStorage + every IndexedDB database (schema and records, with Blobs /
 * Dates / binary encoded), then open a hidden `app://latch/__migrate.html` page and
 * restore it there — before the real UI boots. Records and keys are MERGED (added only
 * where the target has none), so this can never clobber newer data and is safe to retry. A flag file makes it run once; a failure
 * is logged and retried on the next launch (the old data is never modified or deleted).
 *
 * Not migrated: Cache Storage (AI model downloads — re-fetched on demand).
 */
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { writeFile, unlink } from 'fs/promises'
import { APP_ORIGIN } from './protocol'

export const MIGRATE_PATH = '/__migrate.html'
const FLAG_FILE = '.storage-migrated-app-scheme'

// Runs in the page. Tagged JSON so Blobs, Dates and binary survive the trip.
const CODEC = String.raw`
const enc = async (v) => {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number' && !Number.isFinite(v)) return { __t: 'num', v: String(v) }
    if (v === undefined) return { __t: 'undef' }
    return v
  }
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s) }
  if (v instanceof Date) return { __t: 'date', v: v.getTime() }
  if (v instanceof Blob) {
    const u8 = new Uint8Array(await v.arrayBuffer())
    return { __t: v instanceof File ? 'file' : 'blob', type: v.type, name: v instanceof File ? v.name : undefined, v: b64(u8) }
  }
  if (v instanceof ArrayBuffer) return { __t: 'ab', v: b64(new Uint8Array(v)) }
  if (ArrayBuffer.isView(v)) return { __t: 'view', c: v.constructor.name, v: b64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) }
  if (Array.isArray(v)) { const out = []; for (const x of v) out.push(await enc(x)); return out }
  if (v instanceof Map) { const out = []; for (const [k, x] of v) out.push([await enc(k), await enc(x)]); return { __t: 'map', v: out } }
  if (v instanceof Set) { const out = []; for (const x of v) out.push(await enc(x)); return { __t: 'set', v: out } }
  const out = {}
  for (const k of Object.keys(v)) out[k] = await enc(v[k])
  return Object.prototype.hasOwnProperty.call(v, '__t') ? { __t: 'obj', v: out } : out
}
const dec = (v) => {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(dec)
  const u8 = (s) => { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a }
  switch (v.__t) {
    case 'num': return Number(v.v)
    case 'undef': return undefined
    case 'date': return new Date(v.v)
    case 'blob': return new Blob([u8(v.v)], { type: v.type })
    case 'file': return new File([u8(v.v)], v.name || 'file', { type: v.type })
    case 'ab': return u8(v.v).buffer
    case 'view': { const a = u8(v.v); const C = globalThis[v.c]; return C && C.BYTES_PER_ELEMENT ? new C(a.buffer, 0, a.byteLength / C.BYTES_PER_ELEMENT) : (v.c === 'DataView' ? new DataView(a.buffer) : a) }
    case 'map': return new Map(v.v.map(([k, x]) => [dec(k), dec(x)]))
    case 'set': return new Set(v.v.map(dec))
    case 'obj': { const o = {}; for (const k of Object.keys(v.v)) o[k] = dec(v.v[k]); return o }
  }
  const o = {}
  for (const k of Object.keys(v)) o[k] = dec(v[k])
  return o
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
`

const DUMP_SCRIPT = String.raw`(async () => {
${CODEC}
  try {
  const local = {}
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); local[k] = localStorage.getItem(k) }
  const dbs = []
  for (const info of await indexedDB.databases()) {
    if (!info.name) continue
    const db = await req(indexedDB.open(info.name))
    const stores = []
    for (const storeName of Array.from(db.objectStoreNames)) {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const indexes = Array.from(store.indexNames).map((n) => { const ix = store.index(n); return { name: n, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry } })
      const raw = []
      await new Promise((res, rej) => {
        const c = store.openCursor()
        c.onsuccess = () => { const cur = c.result; if (!cur) return res(); raw.push([cur.primaryKey, cur.value]); cur.continue() }
        c.onerror = () => rej(c.error)
      })
      const records = []
      for (const [k, v] of raw) records.push([await enc(k), await enc(v)])
      stores.push({ name: storeName, keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes, records })
    }
    dbs.push({ name: db.name, version: db.version, stores })
    db.close()
  }
  return JSON.stringify({ local, dbs })
  } catch (e) {
    // DOMExceptions don't survive executeJavaScript (they arrive as {}): report the text.
    return JSON.stringify({ __error: (e && e.name) + ': ' + (e && e.message) })
  }
})()`

// MERGE, never overwrite: a record / key is added only where the target has none. That keeps
// it safe to retry after a failed attempt (or after the app already booted and wrote its own
// defaults) without ever clobbering data created under app://.
const RESTORE_FN = String.raw`(async (json) => {
${CODEC}
  const dump = JSON.parse(json)
  let added = 0
  let skipped = 0
  const existing = await indexedDB.databases()
  for (const db of dump.dbs) {
    const prev = existing.find((d) => d.name === db.name)
    const open = indexedDB.open(db.name, Math.max(db.version, prev ? prev.version : 0))
    open.onupgradeneeded = () => {
      const target = open.result
      for (const s of db.stores) {
        if (target.objectStoreNames.contains(s.name)) continue
        const opts = { autoIncrement: s.autoIncrement }
        if (s.keyPath !== null) opts.keyPath = s.keyPath
        const store = target.createObjectStore(s.name, opts)
        for (const ix of s.indexes) store.createIndex(ix.name, ix.keyPath, { unique: ix.unique, multiEntry: ix.multiEntry })
      }
    }
    const target = await req(open)
    const stores = db.stores.filter((s) => target.objectStoreNames.contains(s.name))
    if (stores.length) {
      const tx = target.transaction(stores.map((s) => s.name), 'readwrite')
      for (const s of stores) {
        const store = tx.objectStore(s.name)
        for (const [k, v] of s.records) {
          const r = s.keyPath === null ? store.add(dec(v), dec(k)) : store.add(dec(v))
          r.onsuccess = () => { added++ }
          // Key already present (ConstraintError): keep the target's record, don't abort the tx.
          r.onerror = (ev) => { ev.preventDefault(); ev.stopPropagation(); skipped++ }
        }
      }
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error) })
    }
    target.close()
  }
  for (const [k, v] of Object.entries(dump.local)) {
    if (localStorage.getItem(k) === null) { localStorage.setItem(k, v); added++ } else skipped++
  }
  return 'merged ' + added + ' (kept ' + skipped + ' existing)'
})`

function hiddenWindow(): BrowserWindow {
  return new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true },
  })
}

/** Response body for `app://latch/__migrate.html` (an empty same-origin document). */
export const MIGRATE_PAGE = '<!doctype html><meta charset="utf-8"><title>LATCH storage migration</title>'

/**
 * Run once, before the main window is created. Never throws; on failure the flag is not
 * written, so the next launch retries (the file:// data is left untouched either way).
 */
export async function migrateFileOriginStorage(): Promise<void> {
  const userData = app.getPath('userData')
  const flag = join(userData, FLAG_FILE)
  if (existsSync(flag)) return

  const blank = join(userData, '.migrate-blank.html')
  let source: BrowserWindow | null = null
  let target: BrowserWindow | null = null
  let stage = 'start'
  try {
    await writeFile(blank, MIGRATE_PAGE)
    stage = 'load-source'
    source = hiddenWindow()
    await source.loadFile(blank)
    stage = 'dump'
    const dump = (await source.webContents.executeJavaScript(DUMP_SCRIPT, true)) as string
    source.destroy()
    source = null

    const parsed = JSON.parse(dump) as { local: Record<string, string>; dbs: unknown[]; __error?: string }
    if (parsed.__error) throw new Error(parsed.__error)
    let result = 'nothing-to-migrate'
    if (Object.keys(parsed.local).length > 0 || parsed.dbs.length > 0) {
      stage = 'load-target'
      target = hiddenWindow()
      await target.loadURL(`${APP_ORIGIN}${MIGRATE_PATH}`)
      stage = 'restore'
      result = (await target.webContents.executeJavaScript(`${RESTORE_FN}(${JSON.stringify(dump)})`, true)) as string
      target.destroy()
      target = null
    }
    await writeFile(flag, `${new Date().toISOString()} ${result}\n`)
    console.log(`[storage-migration] file:// → app:// : ${result}`)
  } catch (error) {
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error) || String(error)
    console.error(`[storage-migration] failed at ${stage} (will retry next launch): ${msg}`)
  } finally {
    source?.destroy()
    target?.destroy()
    await unlink(blank).catch(() => {})
  }
}
