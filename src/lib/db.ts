import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ActivityEvent, Distributor, ScanCode, ScanSession } from '../types'

interface ColisFlowDB extends DBSchema {
  distributors: {
    key: string
    value: Distributor
  }
  sessions: {
    key: string
    value: ScanSession
    indexes: { 'by-distributor': string; 'by-status': string }
  }
  codes: {
    key: string
    value: ScanCode
    indexes: { 'by-session': string; 'by-distributor': string; 'by-code': string }
  }
  events: {
    key: string
    value: ActivityEvent
    indexes: { 'by-at': string }
  }
}

const DB_NAME = 'colisflow'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<ColisFlowDB>> | null = null

function getDB(): Promise<IDBPDatabase<ColisFlowDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ColisFlowDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('distributors')) {
          db.createObjectStore('distributors', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('sessions')) {
          const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
          sessions.createIndex('by-distributor', 'distributorId')
          sessions.createIndex('by-status', 'status')
        }
        if (!db.objectStoreNames.contains('codes')) {
          const codes = db.createObjectStore('codes', { keyPath: 'id' })
          codes.createIndex('by-session', 'sessionId')
          codes.createIndex('by-distributor', 'distributorId')
          codes.createIndex('by-code', 'code')
        }
        if (!db.objectStoreNames.contains('events')) {
          const events = db.createObjectStore('events', { keyPath: 'id' })
          events.createIndex('by-at', 'at')
        }
      },
    })
  }
  return dbPromise
}

export interface AllData {
  distributors: Distributor[]
  sessions: ScanSession[]
  codes: ScanCode[]
  events: ActivityEvent[]
}

export async function loadAll(): Promise<AllData> {
  const db = await getDB()
  const [distributors, sessions, codes, events] = await Promise.all([
    db.getAll('distributors'),
    db.getAll('sessions'),
    db.getAll('codes'),
    db.getAll('events'),
  ])
  return {
    distributors,
    sessions,
    codes,
    events: events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 250),
  }
}

export async function putDistributor(distributor: Distributor): Promise<void> {
  const db = await getDB()
  await db.put('distributors', distributor)
}

export async function putSession(session: ScanSession): Promise<void> {
  const db = await getDB()
  await db.put('sessions', session)
}

export async function putCode(code: ScanCode): Promise<void> {
  const db = await getDB()
  await db.put('codes', code)
}

export async function putCodes(codes: ScanCode[]): Promise<void> {
  if (!codes.length) return
  const db = await getDB()
  const tx = db.transaction('codes', 'readwrite')
  await Promise.all(codes.map((code) => tx.store.put(code)))
  await tx.done
}

export async function putEvent(event: ActivityEvent): Promise<void> {
  const db = await getDB()
  await db.put('events', event)
}

export async function deleteDistributorRecord(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('distributors', id)
}

export async function deleteSessionRecord(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('sessions', id)
}

export async function deleteCodeRecord(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('codes', id)
}

export async function deleteCodeRecords(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = await getDB()
  const tx = db.transaction('codes', 'readwrite')
  await Promise.all(ids.map((id) => tx.store.delete(id)))
  await tx.done
}

export async function replaceAll(data: AllData): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['distributors', 'sessions', 'codes', 'events'], 'readwrite')
  await Promise.all([
    tx.objectStore('distributors').clear(),
    tx.objectStore('sessions').clear(),
    tx.objectStore('codes').clear(),
    tx.objectStore('events').clear(),
  ])
  await Promise.all([
    ...data.distributors.map((item) => tx.objectStore('distributors').put(item)),
    ...data.sessions.map((item) => tx.objectStore('sessions').put(item)),
    ...data.codes.map((item) => tx.objectStore('codes').put(item)),
    ...data.events.map((item) => tx.objectStore('events').put(item)),
  ])
  await tx.done
}

export async function clearAllData(): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['distributors', 'sessions', 'codes', 'events'], 'readwrite')
  await Promise.all([
    tx.objectStore('distributors').clear(),
    tx.objectStore('sessions').clear(),
    tx.objectStore('codes').clear(),
    tx.objectStore('events').clear(),
  ])
  await tx.done
}

export async function storageUsage(): Promise<{ used: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null
    const estimate = await navigator.storage.estimate()
    return { used: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
  } catch {
    return null
  }
}
