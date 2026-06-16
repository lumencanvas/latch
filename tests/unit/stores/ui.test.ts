import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUIStore } from '@/stores/ui'

describe('UI Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should have correct initial state', () => {
    const store = useUIStore()

    expect(store.sidebarOpen).toBe(true)
    expect(store.propertiesPanelOpen).toBe(true)
    expect(store.shaderEditorOpen).toBe(false)
    expect(store.zoom).toBe(1)
    expect(store.selectedNodes).toEqual([])
    expect(store.theme).toBe('light')
  })

  it('requestNodeAdd queues a node and bumps the nonce; closes the palette on mobile', () => {
    const store = useUIStore()
    expect(store.pendingNodeAdd).toBeNull()

    store.requestNodeAdd('constant')
    expect(store.pendingNodeAdd).toBe('constant')
    expect(store.nodeAddNonce).toBe(1)
    expect(store.sidebarOpen).toBe(true) // desktop: palette stays open

    store.requestNodeAdd('add')
    expect(store.pendingNodeAdd).toBe('add')
    expect(store.nodeAddNonce).toBe(2) // nonce advances so the editor re-fires

    // On mobile, adding closes the overlay palette so the new node is visible.
    store.setIsMobile(true)
    store.sidebarOpen = true
    store.requestNodeAdd('multiply')
    expect(store.sidebarOpen).toBe(false)
  })

  it('should toggle sidebar', () => {
    const store = useUIStore()

    expect(store.sidebarOpen).toBe(true)

    store.toggleSidebar()
    expect(store.sidebarOpen).toBe(false)

    store.toggleSidebar()
    expect(store.sidebarOpen).toBe(true)
  })

  it('should manage node selection', () => {
    const store = useUIStore()

    expect(store.hasSelection).toBe(false)

    store.selectNodes(['node1', 'node2'])
    expect(store.selectedNodes).toEqual(['node1', 'node2'])
    expect(store.hasSelection).toBe(true)
    expect(store.selectionCount).toBe(2)

    store.addToSelection('node3')
    expect(store.selectedNodes).toHaveLength(3)

    store.removeFromSelection('node2')
    expect(store.selectedNodes).toEqual(['node1', 'node3'])

    store.clearSelection()
    expect(store.selectedNodes).toEqual([])
    expect(store.hasSelection).toBe(false)
  })

  it('should toggle node selection', () => {
    const store = useUIStore()

    store.toggleNodeSelection('node1')
    expect(store.selectedNodes).toContain('node1')

    store.toggleNodeSelection('node1')
    expect(store.selectedNodes).not.toContain('node1')
  })

  it('should manage zoom', () => {
    const store = useUIStore()

    expect(store.zoom).toBe(1)

    store.zoomIn()
    expect(store.zoom).toBeCloseTo(1.2, 1)

    store.zoomOut()
    expect(store.zoom).toBeCloseTo(1, 1)

    store.setZoom(2)
    expect(store.zoom).toBe(2)

    store.resetZoom()
    expect(store.zoom).toBe(1)
  })

  it('should clamp zoom values', () => {
    const store = useUIStore()

    store.setZoom(10)
    expect(store.zoom).toBe(4) // Max

    store.setZoom(0.01)
    expect(store.zoom).toBe(0.1) // Min
  })

  it('should manage grid settings', () => {
    const store = useUIStore()

    expect(store.showGrid).toBe(true)
    expect(store.snapToGrid).toBe(true)
    expect(store.gridSize).toBe(20)

    store.toggleGrid()
    expect(store.showGrid).toBe(false)

    store.toggleSnapToGrid()
    expect(store.snapToGrid).toBe(false)

    store.setGridSize(40)
    expect(store.gridSize).toBe(40)
  })

  it('should clamp grid size', () => {
    const store = useUIStore()

    store.setGridSize(5)
    expect(store.gridSize).toBe(10) // Min

    store.setGridSize(200)
    expect(store.gridSize).toBe(100) // Max
  })
})
