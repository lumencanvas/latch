import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionStatusBadge from '@/components/connections/ConnectionStatusBadge.vue'
import type { ConnectionStatus } from '@/services/connections/types'

/**
 * ConnectionStatusBadge — accessible name (WCAG 4.1.2) + the DOM contract that
 * drives the visual status/shape cue (WCAG 1.4.1).
 *
 * The badge previously relied on Tailwind classes this project doesn't ship, so
 * it rendered nothing. Styling now lives in a scoped block keyed off
 * `data-status`; happy-dom can't read that CSS, so these tests lock the DOM
 * contract (role / name / data-status / size + pulse classes) and the rendered
 * colour + error-square shape are browser-verified separately.
 */
describe('ConnectionStatusBadge', () => {
  const badge = (status: ConnectionStatus, props: Record<string, unknown> = {}) =>
    mount(ConnectionStatusBadge, { props: { status, ...props } }).get('.status-badge')

  it('exposes the status as an accessible image name and hover title', () => {
    const connected = badge('connected')
    expect(connected.attributes('role')).toBe('img')
    expect(connected.attributes('aria-label')).toBe('Connected')
    expect(connected.attributes('title')).toBe('Connected')
    expect(badge('error').attributes('aria-label')).toBe('Error')
    expect(badge('disconnected').attributes('aria-label')).toBe('Disconnected')
  })

  it('lets an explicit label override the status name', () => {
    expect(badge('error', { label: 'MQTT broker unreachable' }).attributes('aria-label')).toBe(
      'MQTT broker unreachable'
    )
  })

  it('carries the status on data-status so scoped CSS can colour + shape it', () => {
    for (const s of ['connected', 'connecting', 'reconnecting', 'disconnected', 'error'] as ConnectionStatus[]) {
      expect(badge(s).attributes('data-status')).toBe(s)
    }
  })

  it('applies the requested size class', () => {
    expect(badge('connected', { size: 'sm' }).classes()).toContain('status-badge--sm')
    expect(badge('connected', { size: 'lg' }).classes()).toContain('status-badge--lg')
    // default
    expect(badge('connected').classes()).toContain('status-badge--md')
  })

  it('pulses only for the transient connecting states, and only when enabled', () => {
    expect(badge('connecting').classes()).toContain('status-badge--pulse')
    expect(badge('reconnecting').classes()).toContain('status-badge--pulse')
    expect(badge('connected').classes()).not.toContain('status-badge--pulse')
    expect(badge('error').classes()).not.toContain('status-badge--pulse')
    expect(badge('connecting', { pulse: false }).classes()).not.toContain('status-badge--pulse')
  })
})
