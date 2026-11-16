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
    Boolean(a.manual) === Boolean(b.manual) &&
    (a.names ?? []).join('\u0000') === (b.names ?? []).join('\u0000') &&
    (a.message ?? '') === (b.message ?? '')
  )
}

/**
 * Feed order for the activity panel: runs started by hand come first, so the
 * automatic heartbeat can never bury the manual import the operator just did.
 * Inside each group the newest run stays on top.
 */
export function orderSyncLog(entries: SyncLogEntry[]): SyncLogEntry[] {
  return [...entries].sort((a, b) => {
    if (Boolean(a.manual) !== Boolean(b.manual)) return a.manual ? -1 : 1
    return b.at.localeCompare(a.at)
  })
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
