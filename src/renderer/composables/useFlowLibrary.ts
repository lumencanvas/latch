import { useFlowsStore, type ImportReport } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'
import { usePersistence } from '@/composables/usePersistence'
import * as fileFormat from '@/services/fileFormat'

/** True when text is a LATCH flow or project file (what Copy Flow JSON / Export produce). */
export function looksLikeFlowText(text: string): boolean {
  const t = text.trim()
  if (!t.startsWith('{')) return false
  try {
    return fileFormat.looksLikeLatchFile(JSON.parse(t))
  } catch {
    return false
  }
}

/**
 * Flow library actions shared by the Flows sidebar, the tab menu, the header and paste:
 * everything that opens, closes, shares or brings in a flow, persisted as it happens.
 */
export function useFlowLibrary() {
  const flows = useFlowsStore()
  const ui = useUIStore()
  const { saveFlow, saveAllFlows, deleteFlow: deleteFromDb } = usePersistence()

  /** After an import: persist, switch to the first new flow, report the outcome. */
  async function finishImport(result: ImportReport): Promise<void> {
    if (result.success) {
      // Imported flows live only in the store until written (autosave covers just the active flow).
      await saveAllFlows()
      const first = result.flowIds?.[0]
      if (first) flows.setActiveFlow(first)
      const hadIssues = !!(result.unknownNodes || result.droppedEdges || result.warnings?.length)
      ui.notify(result.message, hadIssues ? 'warning' : 'success')
    } else if (result.message !== 'Import cancelled' && result.message !== 'No file selected') {
      ui.notify(result.message, 'error', 0)
    }
  }

  async function importFile(): Promise<void> {
    await finishImport(await flows.promptImport({ replace: false }))
  }

  /** Open pasted flow JSON as new flow tab(s). Returns false (and does nothing) if it isn't flow JSON. */
  /**
   * Open pasted or supplied flow JSON as new tabs. `untrusted` (text an AI agent wrote) skips the
   * trust prompt and always imports code nodes disabled: only a person clicking Enable code runs them.
   */
  async function importText(text: string, options: { untrusted?: boolean } = {}): Promise<boolean> {
    if (!looksLikeFlowText(text)) return false
    const result = options.untrusted
      ? flows.importFlows(text.trim(), { replace: false, codePolicy: 'disable' })
      : await flows.importFlowsWithTrustPrompt(text.trim(), { replace: false })
    await finishImport(result)
    return result.success
  }

  async function newFlow(): Promise<void> {
    const flow = flows.createFlow('Untitled Flow')
    await saveFlow(flow.id)
  }

  async function openFlow(id: string): Promise<void> {
    const wasClosed = flows.getFlowById(id)?.open === false
    flows.openFlow(id)
    if (wasClosed) await saveFlow(id)
  }

  async function closeFlow(id: string): Promise<void> {
    for (const changed of flows.closeFlow(id)) await saveFlow(changed)
  }

  async function renameFlow(id: string, name: string): Promise<void> {
    const n = name.trim()
    if (!n) return
    flows.renameFlow(id, n)
    await saveFlow(id)
  }

  async function duplicateFlow(id: string): Promise<void> {
    const copy = flows.duplicateFlow(id, (idMap) => ui.cloneControlPanelForNodes(idMap))
    if (copy) {
      flows.setActiveFlow(copy.id)
      await saveFlow(copy.id)
    }
  }

  async function deleteFlow(id: string): Promise<void> {
    const wasActive = flows.activeFlowId === id
    await deleteFromDb(id)
    flows.deleteFlow(id)
    if (!flows.openFlows.length) {
      await newFlow()
    } else if (wasActive || !flows.openFlows.some((f) => f.id === flows.activeFlowId)) {
      flows.setActiveFlow(flows.openFlows[0].id)
    }
  }

  async function copyFlowJson(id: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(flows.exportFlow(id))
      ui.notify('Flow copied. Paste it into LATCH (⌘V / Ctrl+V) or share the text.', 'success')
    } catch {
      ui.notify('Could not copy to the clipboard. Use Export Flow instead.', 'error')
    }
  }

  return {
    importFile, importText, newFlow, openFlow, closeFlow, renameFlow, duplicateFlow, deleteFlow, copyFlowJson,
    exportFlow: (id: string) => flows.exportFlowFile(id),
    exportAll: () => flows.exportAllFlows(),
  }
}
