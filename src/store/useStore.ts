import { create } from 'zustand'
import type {
  ActivityEvent,
  ActivityType,
  AddCodeResult,
  BulkAddResult,
  CodeSource,
  Distributor,
  MoveCodesResult,
  ScanCode,
  ScanDistributor,
  ScanSession,
  ScannerImportResult,
  Settings,
  SyncLogEntry,
} from '../types'
import * as db from '../lib/db'
import type { AllData } from '../lib/db'
import { DEFAULT_SENDIT_PREFIXES, extractCode, uniqueCodes } from '../lib/codes'
import { buildDemoData } from '../lib/demo'
import { FIXED_LISTS, isFixedListName, normalizeFixedName } from '../lib/fixedLists'
import { DEFAULT_SUD_URL } from '../lib/sud'
import { appendSyncLog, loadSyncLog, persistSyncLog } from '../lib/syncLog'
import { uid } from '../lib/utils'

const SETTINGS_KEY = 'colisflow.settings'

export const defaultSettings: Settings = {
  lang: 'fr',
  theme: 'dark',
  shopName: '',
  operatorName: '',
  senditPrefixes: DEFAULT_SENDIT_PREFIXES,
  sound: true,
  haptics: true,
  keepAwake: false,
  sudUrl: DEFAULT_SUD_URL,
  sudKey: '',
}

function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<Settings>
    return {
      ...defaultSettings,
      ...raw,
      senditPrefixes:
        Array.isArray(raw.senditPrefixes) && raw.senditPrefixes.length
          ? raw.senditPrefixes
          : DEFAULT_SENDIT_PREFIXES,
    }
  } catch {
    return { ...defaultSettings }
  }
}

function persistSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* storage may be unavailable */
  }
}

/**
 * Guarantees the six permanent routeur lists exist, are active and flagged as
 * fixed. Existing distributors that happen to share a fixed name are adopted
 * (and restored from the archive) instead of being duplicated.
 */
function ensureFixedDistributors(distributors: Distributor[]): {
  distributors: Distributor[]
  created: Distributor[]
  updated: Distributor[]
} {
  const now = new Date().toISOString()
  const result = [...distributors]
  const created: Distributor[] = []
  const updated: Distributor[] = []

  for (const fixed of FIXED_LISTS) {
    const index = result.findIndex(
      (item) => normalizeFixedName(item.name) === normalizeFixedName(fixed.name),
    )
    if (index === -1) {
      const entry: Distributor = {
        id: fixed.id,
        name: fixed.name,
        createdAt: now,
        updatedAt: now,
        archived: false,
        fixed: true,
      }
      result.push(entry)
      created.push(entry)
      continue
    }
    const existing = result[index]
    if (!existing.fixed || existing.archived) {
      const entry: Distributor = {
        ...existing,
        fixed: true,
        archived: false,
        archivedAt: undefined,
      }
      result[index] = entry
      updated.push(entry)
    }
  }

  return { distributors: result, created, updated }
}

export interface DistributorSnapshot {
  distributor: Distributor
  sessions: ScanSession[]
  codes: ScanCode[]
}

export interface CancelledSessionSnapshot {
  session: ScanSession
  codes: ScanCode[]
}

interface StoreState extends AllData {
  ready: boolean
  settings: Settings
  /** Recent Colis Scanner → ColisFlow sync runs, newest first. */
  syncLog: SyncLogEntry[]
  init: () => Promise<void>
  startSession: (name: string, source?: CodeSource) => ScanSession | null
  addCode: (raw: string, source?: CodeSource) => AddCodeResult
  addCodes: (rawCodes: string[], source?: CodeSource) => BulkAddResult
  moveCodesToDistributor: (codeIds: string[], targetDistributorId: string) => MoveCodesResult
  deleteCode: (id: string) => ScanCode | null
  restoreCode: (code: ScanCode) => boolean
  /** Sets a code's entry date by hand; a manual date also drives the late count. */
  setCodeDate: (id: string, scannedAt: string) => boolean
  /** Sets the same entry date on every code held by one distributor. */
  setDistributorCodeDates: (distributorId: string, scannedAt: string) => number
  finishSession: () => Promise<boolean>
  cancelSession: () => Promise<CancelledSessionSnapshot | null>
  restoreSession: (snapshot: CancelledSessionSnapshot) => void
  renameDistributor: (id: string, name: string) => boolean
  updateDistributorInfo: (id: string, patch: Pick<Partial<Distributor>, 'phone' | 'note'>) => void
  archiveDistributor: (id: string) => Promise<void>
  restoreDistributor: (id: string) => Promise<void>
  deleteDistributor: (id: string) => Promise<DistributorSnapshot | null>
  restoreDistributorSnapshot: (snapshot: DistributorSnapshot) => Promise<void>
  importFromScanner: (items: ScanDistributor[]) => Promise<ScannerImportResult>
  /** Records one Colis Scanner → ColisFlow sync run for the activity panel. */
  logSync: (entry: Omit<SyncLogEntry, 'id' | 'at'> & { at?: string }) => void
  setSettings: (patch: Partial<Settings>) => void
  seedDemo: () => Promise<void>
  resetAll: () => Promise<void>
  importData: (data: AllData, settings?: Partial<Settings>) => Promise<void>
  logExport: (subject?: string) => void
}

let initPromise: Promise<void> | null = null

export const useStore = create<StoreState>((set, get) => {
  const logEvent = (type: ActivityType, subject?: string, detail?: string) => {
    const event: ActivityEvent = {
      id: uid('evt'),
      at: new Date().toISOString(),
      type,
      subject,
      detail,
    }
    set((state) => ({ events: [event, ...state.events].slice(0, 250) }))
    void db.putEvent(event)
  }

  const persistDistributor = (distributor: Distributor) => {
    void db.putDistributor(distributor)
  }

  const activeDistributorIds = (): Set<string> =>
    new Set(
      get()
        .distributors.filter((distributor) => !distributor.archived)
        .map((distributor) => distributor.id),
    )

  return {
    ready: false,
    distributors: [],
    sessions: [],
    codes: [],
    events: [],
    syncLog: loadSyncLog(),
    settings: loadSettings(),

    init: async () => {
      if (get().ready) return
      if (initPromise) return initPromise

      initPromise = (async () => {
        try {
          const data = await db.loadAll()
          const sortedSessions = [...data.sessions].sort((a, b) =>
            b.startedAt.localeCompare(a.startedAt),
          )
          const actives = sortedSessions.filter((session) => session.status === 'active')
          let sessions = sortedSessions
          if (actives.length > 1) {
            const keep = actives[0]
            sessions = sortedSessions.map((session) =>
              session.status === 'active' && session.id !== keep.id
                ? { ...session, status: 'completed' as const, endedAt: new Date().toISOString() }
                : session,
            )
            const fixed = sessions.filter((session) => session.id !== keep.id && actives.some((a) => a.id === session.id))
            fixed.forEach((session) => void db.putSession(session))
          }
          const ensured = ensureFixedDistributors(data.distributors)
          set({ ...data, distributors: ensured.distributors, sessions, ready: true })
          ensured.created.forEach((entry) => void db.putDistributor(entry))
          ensured.updated.forEach((entry) => void db.putDistributor(entry))
        } catch (error) {
          console.error('Failed to load local data', error)
          set({ ready: true })
        }
      })()

      return initPromise
    },

    startSession: (name, source = 'manual') => {
      const cleanName = name.trim().replace(/\s+/g, ' ')
      if (!cleanName) return null
      const state = get()
      const now = new Date().toISOString()

      const existingActive = state.sessions.find((session) => session.status === 'active')
      if (existingActive) {
        if (existingActive.distributorName.toLowerCase() === cleanName.toLowerCase()) {
          return existingActive
        }
        const completed: ScanSession = {
          ...existingActive,
          status: 'completed',
          endedAt: now,
        }
        set((current) => ({
          sessions: current.sessions.map((session) =>
            session.id === completed.id ? completed : session,
          ),
        }))
        void db.putSession(completed)
        logEvent('session_end', completed.distributorName, String(state.codes.filter((code) => code.sessionId === completed.id).length))
      }

      let distributor = state.distributors.find(
        (item) => !item.archived && item.name.toLowerCase() === cleanName.toLowerCase(),
      )

      if (!distributor) {
        distributor = {
          id: uid('dist'),
          name: cleanName,
          createdAt: now,
          updatedAt: now,
          archived: false,
        }
        set((current) => ({ distributors: [...current.distributors, distributor as Distributor] }))
        persistDistributor(distributor)
      }

      const session: ScanSession = {
        id: uid('sess'),
        distributorId: distributor.id,
        distributorName: distributor.name,
        startedAt: now,
        status: 'active',
        source,
      }

      set((current) => ({ sessions: [session, ...current.sessions] }))
      void db.putSession(session)
      logEvent('session_start', distributor.name)
      return session
    },

    addCode: (raw, source = 'manual') => {
      const state = get()
      const session = state.sessions.find((item) => item.status === 'active')
      if (!session) return { status: 'no-session' }

      const rawValue = String(raw ?? '').trim()
      const code = extractCode(rawValue)
      if (!code) return { status: 'invalid' }

      if (state.codes.some((item) => item.sessionId === session.id && item.code === code)) {
        return { status: 'duplicate', code }
      }

      const activeIds = activeDistributorIds()
      const moved = state.codes.filter(
        (item) =>
          item.code === code &&
          item.distributorId !== session.distributorId &&
          activeIds.has(item.distributorId),
      )
      const movedIds = new Set(moved.map((item) => item.id))
      const now = new Date().toISOString()
      const movedFromName = moved[0]
        ? (state.distributors.find((item) => item.id === moved[0].distributorId)?.name ?? '')
        : ''
      const newCode: ScanCode = {
        id: uid('code'),
        code,
        raw: rawValue,
        sessionId: session.id,
        distributorId: session.distributorId,
        // A moved code keeps the day it was first scanned.
        scannedAt: moved[0]?.scannedAt ?? now,
        source,
        ...(moved[0]
          ? {
              movedFrom: {
                distributorId: moved[0].distributorId,
                distributorName: movedFromName,
                // The late count restarts from the day of the move.
                movedAt: now,
              },
            }
          : {}),
      }

      const distributor = state.distributors.find((item) => item.id === session.distributorId)
      const updatedDistributor = distributor ? { ...distributor, updatedAt: now } : null

      set((current) => ({
        codes: [...current.codes.filter((item) => !movedIds.has(item.id)), newCode],
        distributors: updatedDistributor
          ? current.distributors.map((item) =>
              item.id === updatedDistributor.id ? updatedDistributor : item,
            )
          : current.distributors,
      }))

      void db.putCode(newCode)
      if (movedIds.size) void db.deleteCodeRecords(Array.from(movedIds))
      if (updatedDistributor) persistDistributor(updatedDistributor)

      if (moved.length) {
        logEvent('code_move', code, `${movedFromName} → ${session.distributorName}`)
        return {
          status: 'moved',
          code,
          codeId: newCode.id,
          movedFrom: { distributorId: moved[0].distributorId, distributorName: movedFromName },
        }
      }

      return { status: 'added', code, codeId: newCode.id }
    },

    addCodes: (rawCodes, source = 'manual') => {
      const state = get()
      const session = state.sessions.find((item) => item.status === 'active')
      const empty: BulkAddResult = {
        added: 0,
        duplicates: 0,
        moved: 0,
        invalid: 0,
        movedList: [],
        newCodes: [],
        removed: [],
      }
      if (!session) return empty

      const parsed = rawCodes
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .map(extractCode)
      if (!parsed.length) return empty

      const unique = uniqueCodes(parsed)
      const withinInputDuplicates = parsed.length - unique.length
      const sessionCodes = new Set(
        state.codes.filter((item) => item.sessionId === session.id).map((item) => item.code),
      )
      const existingDuplicates = unique.filter((code) => sessionCodes.has(code)).length
      const toAdd = unique.filter((code) => !sessionCodes.has(code))
      if (!toAdd.length) {
        return {
          ...empty,
          duplicates: withinInputDuplicates + existingDuplicates,
          invalid: 0,
        }
      }

      const activeIds = activeDistributorIds()
      const incoming = new Set(toAdd)
      const removed = state.codes.filter(
        (item) =>
          incoming.has(item.code) &&
          item.distributorId !== session.distributorId &&
          activeIds.has(item.distributorId),
      )
      const removedIds = new Set(removed.map((item) => item.id))
      const now = new Date().toISOString()
      const distributorNames = new Map(
        state.distributors.map((distributor) => [distributor.id, distributor.name]),
      )

      const newCodes: ScanCode[] = toAdd.map((code) => {
        const sourceRecord = removed.find((item) => item.code === code)
        return {
          id: uid('code'),
          code,
          raw: code,
          sessionId: session.id,
          distributorId: session.distributorId,
          // A moved code keeps the day it was first scanned.
          scannedAt: sourceRecord?.scannedAt ?? now,
          source,
          ...(sourceRecord
            ? {
                movedFrom: {
                  distributorId: sourceRecord.distributorId,
                  distributorName: distributorNames.get(sourceRecord.distributorId) ?? '',
                  // The late count restarts from the day of the move.
                  movedAt: now,
                },
              }
            : {}),
        }
      })

      const movedCodes = uniqueCodes(removed.map((item) => item.code))
      const movedList = movedCodes.map((code) => {
        const record = removed.find((item) => item.code === code)
        return { code, from: distributorNames.get(record?.distributorId ?? '') ?? '' }
      })

      const distributor = state.distributors.find((item) => item.id === session.distributorId)
      const updatedDistributor = distributor ? { ...distributor, updatedAt: now } : null

      set((current) => ({
        codes: [...current.codes.filter((item) => !removedIds.has(item.id)), ...newCodes],
        distributors: updatedDistributor
          ? current.distributors.map((item) =>
              item.id === updatedDistributor.id ? updatedDistributor : item,
            )
          : current.distributors,
      }))

      void db.putCodes(newCodes)
      if (removedIds.size) void db.deleteCodeRecords(Array.from(removedIds))
      if (updatedDistributor) persistDistributor(updatedDistributor)

      if (movedCodes.length) {
        logEvent(
          'code_move',
          movedCodes.length === 1 ? movedCodes[0] : `${movedCodes.length} codes`,
          `${movedList[0]?.from ?? ''} → ${session.distributorName}`,
        )
      }
      if (source === 'import') {
        logEvent('import', undefined, String(newCodes.length))
      }

      return {
        added: newCodes.length,
        duplicates: withinInputDuplicates + existingDuplicates,
        moved: movedCodes.length,
        invalid: 0,
        movedList,
        newCodes,
        removed,
      }
    },

    moveCodesToDistributor: (codeIds, targetDistributorId) => {
      const state = get()
      const target = state.distributors.find((item) => item.id === targetDistributorId)
      if (!target) return { moved: 0, merged: 0 }
      const ids = new Set(codeIds)
      const selected = state.codes.filter(
        (code) => ids.has(code.id) && code.distributorId !== target.id,
      )
      if (!selected.length) return { moved: 0, merged: 0 }

      const now = new Date().toISOString()
      const names = new Map(state.distributors.map((item) => [item.id, item.name]))
      const targetCodes = new Set(
        state.codes.filter((code) => code.distributorId === target.id).map((code) => code.code),
      )

      const active = state.sessions.find(
        (session) => session.status === 'active' && session.distributorId === target.id,
      )
      let sessionId = active?.id ?? ''
      let newSession: ScanSession | null = null
      if (!sessionId) {
        newSession = {
          id: uid('sess'),
          distributorId: target.id,
          distributorName: target.name,
          startedAt: now,
          endedAt: now,
          status: 'completed',
          source: 'manual',
        }
        sessionId = newSession.id
      }

      const removedIds = new Set<string>()
      const moved: ScanCode[] = []
      for (const code of selected) {
        if (targetCodes.has(code.code)) {
          // The target already holds this code: drop the source record.
          removedIds.add(code.id)
          continue
        }
        targetCodes.add(code.code)
        moved.push({
          ...code,
          sessionId,
          distributorId: target.id,
          movedFrom: {
            distributorId: code.distributorId,
            distributorName: names.get(code.distributorId) ?? '',
            movedAt: now,
          },
        })
      }

      const movedIds = new Set(moved.map((code) => code.id))
      const updatedTarget: Distributor = { ...target, updatedAt: now }

      set((current) => ({
        codes: [
          ...current.codes.filter(
            (code) => !removedIds.has(code.id) && !movedIds.has(code.id),
          ),
          ...moved,
        ],
        sessions: newSession ? [newSession, ...current.sessions] : current.sessions,
        distributors: current.distributors.map((item) =>
          item.id === target.id ? updatedTarget : item,
        ),
      }))

      if (removedIds.size) void db.deleteCodeRecords(Array.from(removedIds))
      if (moved.length) void db.putCodes(moved)
      if (newSession) void db.putSession(newSession)
      persistDistributor(updatedTarget)

      if (moved.length) {
        logEvent(
          'code_move',
          moved.length === 1 ? moved[0].code : `${moved.length} codes`,
          `→ ${target.name}`,
        )
      }
      return { moved: moved.length, merged: removedIds.size }
    },

    deleteCode: (id) => {
      const code = get().codes.find((item) => item.id === id)
      if (!code) return null
      set((current) => ({ codes: current.codes.filter((item) => item.id !== id) }))
      void db.deleteCodeRecord(id)
      logEvent('code_delete', code.code)
      return code
    },

    restoreCode: (code) => {
      const state = get()
      if (!state.sessions.some((session) => session.id === code.sessionId)) return false
      if (state.codes.some((item) => item.code === code.code && item.sessionId === code.sessionId)) {
        return false
      }
      set((current) => ({ codes: [...current.codes, code] }))
      void db.putCode(code)
      return true
    },

    setCodeDate: (id, scannedAt) => {
      const code = get().codes.find((item) => item.id === id)
      if (!code || Number.isNaN(Date.parse(scannedAt))) return false
      const { movedFrom, ...rest } = code
      const updated: ScanCode = {
        ...rest,
        scannedAt,
        // A hand-set date wins for the late count too, so a moved code does not
        // keep restarting from its old move date against the operator's will.
        ...(movedFrom ? { movedFrom: { ...movedFrom, movedAt: scannedAt } } : {}),
      }
      set((current) => ({
        codes: current.codes.map((item) => (item.id === id ? updated : item)),
      }))
      void db.putCode(updated)
      logEvent('code_date', updated.code, scannedAt)
      return true
    },

    setDistributorCodeDates: (distributorId, scannedAt) => {
      if (Number.isNaN(Date.parse(scannedAt))) return 0
      const targets = get().codes.filter((item) => item.distributorId === distributorId)
      if (!targets.length) return 0
      const updated = targets.map((code) => {
        const { movedFrom, ...rest } = code
        const next: ScanCode = {
          ...rest,
          scannedAt,
          ...(movedFrom ? { movedFrom: { ...movedFrom, movedAt: scannedAt } } : {}),
        }
        return next
      })
      const byId = new Map(updated.map((code) => [code.id, code]))
      set((current) => ({
        codes: current.codes.map((item) => byId.get(item.id) ?? item),
      }))
      void Promise.all(updated.map((code) => db.putCode(code)))
      logEvent('code_date', '', String(updated.length))
      return updated.length
    },

    finishSession: async () => {
      const state = get()
      const session = state.sessions.find((item) => item.status === 'active')
      if (!session) return false
      const count = state.codes.filter((code) => code.sessionId === session.id).length
      if (!count) return false
      const now = new Date().toISOString()
      const completed: ScanSession = { ...session, status: 'completed', endedAt: now }
      set((current) => ({
        sessions: current.sessions.map((item) =>
          item.id === completed.id ? completed : item,
        ),
      }))
      await db.putSession(completed)
      logEvent('session_end', session.distributorName, String(count))
      return true
    },

    cancelSession: async () => {
      const state = get()
      const session = state.sessions.find((item) => item.status === 'active')
      if (!session) return null
      const codes = state.codes.filter((code) => code.sessionId === session.id)
      set((current) => ({
        sessions: current.sessions.filter((item) => item.id !== session.id),
        codes: current.codes.filter((code) => code.sessionId !== session.id),
      }))
      await Promise.all([
        db.deleteSessionRecord(session.id),
        db.deleteCodeRecords(codes.map((code) => code.id)),
      ])
      logEvent('session_cancel', session.distributorName)
      return { session, codes }
    },

    restoreSession: (snapshot) => {
      set((current) => {
        const hasActive = current.sessions.some((session) => session.status === 'active')
        const session: ScanSession = {
          ...snapshot.session,
          status: hasActive ? 'completed' : 'active',
          endedAt: hasActive ? (snapshot.session.endedAt ?? new Date().toISOString()) : undefined,
        }
        return {
          sessions: [session, ...current.sessions.filter((item) => item.id !== session.id)],
          codes: [
            ...current.codes.filter((code) => code.sessionId !== session.id),
            ...snapshot.codes,
          ],
        }
      })
      const restored = get().sessions.find((session) => session.id === snapshot.session.id)
      if (restored) void db.putSession(restored)
      void db.putCodes(snapshot.codes)
    },

    renameDistributor: (id, name) => {
      const cleanName = name.trim().replace(/\s+/g, ' ')
      if (!cleanName) return false
      const state = get()
      const duplicate = state.distributors.some(
        (item) =>
          item.id !== id &&
          !item.archived &&
          item.name.toLowerCase() === cleanName.toLowerCase(),
      )
      if (duplicate) return false

      const now = new Date().toISOString()
      const distributor = state.distributors.find((item) => item.id === id)
      if (!distributor) return false
      if (distributor.fixed) return false
      const updated = { ...distributor, name: cleanName, updatedAt: now }
      const sessions = state.sessions
        .filter((session) => session.distributorId === id)
        .map((session) => ({ ...session, distributorName: cleanName }))

      set((current) => ({
        distributors: current.distributors.map((item) => (item.id === id ? updated : item)),
        sessions: current.sessions.map((session) =>
          session.distributorId === id ? { ...session, distributorName: cleanName } : session,
        ),
      }))
      persistDistributor(updated)
      sessions.forEach((session) => void db.putSession(session))
      logEvent('distributor_rename', cleanName)
      return true
    },

    updateDistributorInfo: (id, patch) => {
      const distributor = get().distributors.find((item) => item.id === id)
      if (!distributor) return
      const updated = { ...distributor, ...patch, updatedAt: new Date().toISOString() }
      set((current) => ({
        distributors: current.distributors.map((item) => (item.id === id ? updated : item)),
      }))
      persistDistributor(updated)
    },

    archiveDistributor: async (id) => {
      const state = get()
      const distributor = state.distributors.find((item) => item.id === id)
      if (!distributor) return
      if (distributor.fixed) return
      const now = new Date().toISOString()
      const updated: Distributor = { ...distributor, archived: true, archivedAt: now, updatedAt: now }
      const active = state.sessions.find(
        (session) => session.status === 'active' && session.distributorId === id,
      )
      set((current) => ({
        distributors: current.distributors.map((item) => (item.id === id ? updated : item)),
        sessions: active
          ? current.sessions.map((session) =>
              session.id === active.id
                ? { ...session, status: 'completed' as const, endedAt: now }
                : session,
            )
          : current.sessions,
      }))
      persistDistributor(updated)
      if (active) void db.putSession({ ...active, status: 'completed', endedAt: now })
      logEvent('distributor_archive', distributor.name)
    },

    restoreDistributor: async (id) => {
      const distributor = get().distributors.find((item) => item.id === id)
      if (!distributor) return
      const updated: Distributor = {
        ...distributor,
        archived: false,
        archivedAt: undefined,
        updatedAt: new Date().toISOString(),
      }
      set((current) => ({
        distributors: current.distributors.map((item) => (item.id === id ? updated : item)),
      }))
      persistDistributor(updated)
      logEvent('distributor_restore', distributor.name)
    },

    deleteDistributor: async (id) => {
      const state = get()
      const distributor = state.distributors.find((item) => item.id === id)
      if (!distributor) return null
      if (distributor.fixed) return null
      const sessions = state.sessions.filter((session) => session.distributorId === id)
      const codes = state.codes.filter((code) => code.distributorId === id)
      set((current) => ({
        distributors: current.distributors.filter((item) => item.id !== id),
        sessions: current.sessions.filter((session) => session.distributorId !== id),
        codes: current.codes.filter((code) => code.distributorId !== id),
      }))
      await Promise.all([
        db.deleteDistributorRecord(id),
        ...sessions.map((session) => db.deleteSessionRecord(session.id)),
        db.deleteCodeRecords(codes.map((code) => code.id)),
      ])
      logEvent('distributor_delete', distributor.name)
      return { distributor, sessions, codes }
    },

    restoreDistributorSnapshot: async (snapshot) => {
      set((current) => ({
        distributors: [
          ...current.distributors.filter((item) => item.id !== snapshot.distributor.id),
          snapshot.distributor,
        ],
        sessions: [
          ...current.sessions.filter(
            (session) => session.distributorId !== snapshot.distributor.id,
          ),
          ...snapshot.sessions,
        ],
        codes: [
          ...current.codes.filter((code) => code.distributorId !== snapshot.distributor.id),
          ...snapshot.codes,
        ],
      }))
      await db.putDistributor(snapshot.distributor)
      await Promise.all(snapshot.sessions.map((session) => db.putSession(session)))
      await db.putCodes(snapshot.codes)
    },

    importFromScanner: async (items) => {
      const state = get()
      const now = new Date().toISOString()

      const createdDistributors: Distributor[] = []
      const newSessions: ScanSession[] = []
      const newCodes: ScanCode[] = []
      const removedIds = new Set<string>()
      const touched = new Set<string>()
      const importedNames = new Set<string>()
      let duplicates = 0

      const byCode = new Map(state.codes.map((record) => [record.code, record]))
      const createdByName = new Map<string, Distributor>()

      // Permanent routeur lists keep the codes that were moved into them: the
      // scanner sync must never pull a code back out of a fixed list.
      const fixedIds = new Set(
        state.distributors
          .filter((entry) => entry.fixed || isFixedListName(entry.name))
          .map((entry) => entry.id),
      )

      for (const item of items) {
        const name = item.name.trim()
        if (!name || !item.codes.length) continue

        const lower = name.toLowerCase()
        const fixedRouteur = isFixedListName(name)
        // Colis Scanner names are not always spelled exactly like the six
        // permanent routeur lists (e.g. ROUTEURE ANASS vs ROUTEUR ANASS).
        // Resolve those imports to the canonical fixed distributor instead of
        // creating a second ordinary list that Return Scanner Pro won't group
        // under Routeurs.
        const nameKey = fixedRouteur ? normalizeFixedName(name) : lower
        let distributor = createdByName.get(nameKey)
        if (!distributor && fixedRouteur) {
          distributor = state.distributors.find(
            (entry) =>
              (entry.fixed || isFixedListName(entry.name)) &&
              normalizeFixedName(entry.name) === nameKey,
          )
        }
        // Prefer an already-created entry, then an active distributor, then any match.
        distributor ??=
          state.distributors.find(
            (entry) => !entry.archived && entry.name.toLowerCase() === lower,
          ) ?? state.distributors.find((entry) => entry.name.toLowerCase() === lower)
        if (!distributor) {
          const created: Distributor = {
            id: uid('dist'),
            name,
            createdAt: item.date ?? now,
            updatedAt: now,
            // Imported lists are always active: a list archived or deleted on
            // the Colis Scanner side must still show up under Active here.
            archived: false,
          }
          distributor = created
          createdDistributors.push(created)
          createdByName.set(nameKey, created)
        }

        const sessionId = uid('sess')
        const startedAt = item.date ?? now
        let stamp = Date.parse(startedAt)
        if (Number.isNaN(stamp)) stamp = Date.now()
        let addedHere = 0

        for (const code of item.codes) {
          const existing = byCode.get(code)
          if (existing && existing.distributorId === distributor.id) {
            duplicates += 1
            continue
          }

          // The code already sits in a permanent routeur list: leave it there.
          // The scanner may list it elsewhere (or twice), but a manual move to
          // a fixed list wins and is never undone by the sync.
          if (existing && fixedIds.has(existing.distributorId)) {
            continue
          }

          let movedFrom: ScanCode['movedFrom']
          let scannedAt: string
          if (existing) {
            removedIds.add(existing.id)
            movedFrom = {
              distributorId: existing.distributorId,
              distributorName:
                state.distributors.find((entry) => entry.id === existing.distributorId)?.name ?? '',
              // The code keeps its original scan date for display, but the late
              // count restarts from the day it landed in this new list.
              movedAt: startedAt,
            }
            // A moved code keeps the day it was first scanned.
            scannedAt = existing.scannedAt
            byCode.delete(code)
          } else {
            stamp += 1000
            scannedAt = new Date(Math.min(stamp, Date.now())).toISOString()
          }

          const record: ScanCode = {
            id: uid('code'),
            code,
            raw: code,
            sessionId,
            distributorId: distributor.id,
            scannedAt,
            source: 'import',
            ...(movedFrom ? { movedFrom } : {}),
          }
          newCodes.push(record)
          byCode.set(code, record)
          touched.add(distributor.id)
          addedHere += 1
        }

        // Only keep the import session when at least one code was actually added.
        if (addedHere > 0) {
          importedNames.add(distributor.name)
          newSessions.push({
            id: sessionId,
            distributorId: distributor.id,
            distributorName: name,
            startedAt,
            endedAt: now,
            status: 'completed',
            source: 'import',
          })
        }
      }

      if (!newCodes.length) {
        return { created: 0, updated: 0, added: 0, moved: 0, duplicates, names: [] }
      }

      // A code can be re-imported under another distributor within the same
      // batch; the superseded freshly-created records must not be inserted.
      const added = newCodes.filter((record) => !removedIds.has(record.id))
      const sessionIds = new Set(added.map((record) => record.sessionId))
      const sessions = newSessions.filter((session) => sessionIds.has(session.id))

      const createdIds = new Set(createdDistributors.map((entry) => entry.id))
      const updatedExisting: Distributor[] = []
      for (const id of touched) {
        if (createdIds.has(id)) continue
        const entry = state.distributors.find((item) => item.id === id)
        // Receiving codes always brings a list back under Active, even when it
        // was archived before (imports used to inherit the scanner's flag).
        if (entry) {
          updatedExisting.push({ ...entry, updatedAt: now, archived: false, archivedAt: undefined })
        }
      }
      const updatedById = new Map(updatedExisting.map((entry) => [entry.id, entry]))

      set((current) => ({
        distributors: [
          ...current.distributors.map((entry) => updatedById.get(entry.id) ?? entry),
          ...createdDistributors,
        ],
        sessions: [...current.sessions, ...sessions],
        codes: [...current.codes.filter((record) => !removedIds.has(record.id)), ...added],
      }))

      await Promise.all([
        ...createdDistributors.map((entry) => db.putDistributor(entry)),
        ...updatedExisting.map((entry) => db.putDistributor(entry)),
        ...sessions.map((session) => db.putSession(session)),
        db.putCodes(added),
      ])
      if (removedIds.size) await db.deleteCodeRecords(Array.from(removedIds))

      logEvent('import', 'Colis Scanner', String(added.length))

      return {
        created: createdDistributors.length,
        updated: updatedExisting.length,
        added: added.length,
        moved: removedIds.size,
        duplicates,
        names: Array.from(importedNames),
      }
    },

    logSync: (entry) => {
      const full: SyncLogEntry = {
        id: uid('sync'),
        at: entry.at ?? new Date().toISOString(),
        status: entry.status,
        lists: entry.lists,
        codes: entry.codes,
        added: entry.added,
        moved: entry.moved,
        ...(entry.names && entry.names.length ? { names: entry.names } : {}),
        ...(entry.message ? { message: entry.message } : {}),
      }
      const next = appendSyncLog(get().syncLog, full)
      set({ syncLog: next })
      persistSyncLog(next)
    },

    setSettings: (patch) => {
      const settings = { ...get().settings, ...patch }
      set({ settings })
      persistSettings(settings)
    },

    seedDemo: async () => {
      const demo = buildDemoData()
      const state = get()
      const data: AllData = {
        distributors: [...state.distributors, ...demo.distributors],
        sessions: [...state.sessions, ...demo.sessions],
        codes: [...state.codes, ...demo.codes],
        events: [...demo.events, ...state.events].slice(0, 250),
      }
      set({ ...data })
      await db.replaceAll(data)
      logEvent('demo')
    },

    resetAll: async () => {
      const ensured = ensureFixedDistributors([])
      set({ distributors: ensured.distributors, sessions: [], codes: [], events: [], syncLog: [] })
      persistSyncLog([])
      await db.clearAllData()
      await Promise.all(ensured.created.map((entry) => db.putDistributor(entry)))
    },

    importData: async (data, settingsPatch) => {
      const ensured = ensureFixedDistributors(data.distributors ?? [])
      const normalized: AllData = {
        distributors: ensured.distributors,
        sessions: data.sessions ?? [],
        codes: data.codes ?? [],
        events: (data.events ?? []).slice(0, 250),
      }
      set({ ...normalized })
      await db.replaceAll(normalized)
      if (settingsPatch) get().setSettings(settingsPatch)
      logEvent('import', undefined, String(normalized.codes.length))
    },

    logExport: (subject) => {
      logEvent('export', subject)
    },
  }
})

export function useActiveSession(): ScanSession | undefined {
  return useStore((state) => state.sessions.find((session) => session.status === 'active'))
}
