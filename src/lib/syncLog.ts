import type { SyncLogEntry } from '../types'

/**
 * Local history of the Colis Scanner → ColisFlow syncs, shown in the activity
 * panel of the distributors page. It is diagnostic data, so it lives in
 * localStorage next to the settings instead of the main IndexedDB backup.
 */

export const SYNC_LOG_LIMIT = 40

const STORAGE_KEY = 'colisflow.synclog'

function isEntry(value: unknown): value is SyncLogEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<SyncLogEntry>
  return typeof entry.id === 'string' && typeof entry.at === 'string' && typeof entry.status === 'string'
}

export function loadSyncLog(): SyncLogEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry).slice(0, SYNC_LOG_LIMIT)
  } catch {
    return []
  }
}

export function persistSyncLog(entries: SyncLogEntry[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, SYNC_LOG_LIMIT)))
  } catch {
    /* storage may be unavailable */
  }
}

function sameResult(a: SyncLogEntry, b: SyncLogEntry): boolean {
  return (
    a.status === b.status &&
    a.lists === b.lists &&
    a.codes === b.codes &&
    a.added === b.added &&
    a.moved === b.moved &&
    (a.message ?? '') === (b.message ?? '')
  )
}

/**
 * Adds a run to the log (newest first). Repeated identical runs — such as the
 * idle "no account" state checked every few minutes — collapse into a single
 * entry whose timestamp is refreshed, so the history stays readable instead of
 * being flooded by heartbeat lines.
 */
export function appendSyncLog(entries: SyncLogEntry[], entry: SyncLogEntry): SyncLogEntry[] {
  const [newest, ...rest] = entries
  if (newest && sameResult(newest, entry)) {
    return [{ ...newest, at: entry.at }, ...rest].slice(0, SYNC_LOG_LIMIT)
  }
  return [entry, ...entries].slice(0, SYNC_LOG_LIMIT)
}
