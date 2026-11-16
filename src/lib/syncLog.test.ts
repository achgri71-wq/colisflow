import { describe, expect, it } from 'vitest'
import { appendSyncLog, orderSyncLog, SYNC_LOG_LIMIT } from './syncLog'
import type { SyncLogEntry, SyncStatus } from '../types'

function entry(at: string, patch: Partial<SyncLogEntry> = {}): SyncLogEntry {
  return {
    id: `sync_${at}`,
    at,
    status: 'ok' as SyncStatus,
    lists: 2,
    codes: 10,
    added: 0,
    moved: 0,
    ...patch,
  }
}

describe('appendSyncLog', () => {
  it('keeps the newest run first', () => {
    const log = appendSyncLog([], entry('2026-01-01T10:00:00.000Z'))
    const next = appendSyncLog(log, entry('2026-01-01T10:05:00.000Z', { added: 3 }))
    expect(next.map((item) => item.at)).toEqual([
      '2026-01-01T10:05:00.000Z',
      '2026-01-01T10:00:00.000Z',
    ])
  })

  it('collapses repeated identical runs into one refreshed entry', () => {
    const first = appendSyncLog([], entry('2026-01-01T10:00:00.000Z', { status: 'no-account', lists: 0, codes: 0 }))
    const second = appendSyncLog(first, entry('2026-01-01T10:05:00.000Z', { status: 'no-account', lists: 0, codes: 0 }))
    expect(second).toHaveLength(1)
    expect(second[0].at).toBe('2026-01-01T10:05:00.000Z')
  })

  it('keeps a run when the result changes', () => {
    const first = appendSyncLog([], entry('2026-01-01T10:00:00.000Z', { added: 0 }))
    const second = appendSyncLog(first, entry('2026-01-01T10:05:00.000Z', { added: 4 }))
    expect(second).toHaveLength(2)
  })

  it('keeps a failure next to a success', () => {
    const first = appendSyncLog([], entry('2026-01-01T10:00:00.000Z'))
    const second = appendSyncLog(first, entry('2026-01-01T10:05:00.000Z', { status: 'error', message: 'scanlink.errNetwork' }))
    expect(second).toHaveLength(2)
    expect(second[0].message).toBe('scanlink.errNetwork')
  })

  it('does not collapse runs that imported different lists', () => {
    const first = appendSyncLog([], entry('2026-01-01T10:00:00.000Z', { added: 1, names: ['LIVREUR A'] }))
    const second = appendSyncLog(first, entry('2026-01-01T10:05:00.000Z', { added: 1, names: ['LIVREUR B'] }))
    expect(second).toHaveLength(2)
  })

  it('never grows past the limit', () => {
    let log: SyncLogEntry[] = []
    for (let index = 0; index < SYNC_LOG_LIMIT + 10; index += 1) {
      log = appendSyncLog(log, entry(`2026-01-01T10:${String(index).padStart(2, '0')}:00.000Z`, { added: index }))
    }
    expect(log).toHaveLength(SYNC_LOG_LIMIT)
  })

  it('does not collapse an automatic heartbeat into a manual run', () => {
    const manual = appendSyncLog([], entry('2026-01-01T10:00:00.000Z', { manual: true }))
    const next = appendSyncLog(manual, entry('2026-01-01T10:05:00.000Z'))
    expect(next).toHaveLength(2)
    expect(next[0].manual).toBeUndefined()
    expect(next[1].manual).toBe(true)
  })
})

describe('orderSyncLog', () => {
  it('shows manual runs before automatic ones, newest first in each group', () => {
    const log = [
      entry('2026-01-01T10:05:00.000Z'),
      entry('2026-01-01T10:00:00.000Z', { manual: true }),
      entry('2026-01-01T10:03:00.000Z'),
      entry('2026-01-01T09:00:00.000Z', { manual: true }),
    ]
    expect(orderSyncLog(log).map((item) => item.at)).toEqual([
      '2026-01-01T10:00:00.000Z',
      '2026-01-01T09:00:00.000Z',
      '2026-01-01T10:05:00.000Z',
      '2026-01-01T10:03:00.000Z',
    ])
  })

  it('does not mutate the stored log', () => {
    const log = [entry('2026-01-01T10:05:00.000Z'), entry('2026-01-01T10:00:00.000Z', { manual: true })]
    orderSyncLog(log)
    expect(log[0].manual).toBeUndefined()
  })
})
