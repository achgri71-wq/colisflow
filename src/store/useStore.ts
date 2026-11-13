import { create } from 'zustand'
import type {
  ActivityEvent,
  ActivityType,
  AddCodeResult,
  BulkAddResult,
  CodeSource,
  Distributor,
  ScanCode,
  ScanSession,
  Settings,
} from '../types'
import * as db from '../lib/db'
import type { AllData } from '../lib/db'
import { DEFAULT_SENDIT_PREFIXES, extractCode, uniqueCodes } from '../lib/codes'
import { buildDemoData } from '../lib/demo'
import { DEFAULT_SUD_URL } from '../lib/sud'
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
  init: () => Promise<void>
  startSession: (name: string, source?: CodeSource) => ScanSession | null
  addCode: (raw: string, source?: CodeSource) => AddCodeResult
  addCodes: (rawCodes: string[], source?: CodeSource) => BulkAddResult
  deleteCode: (id: string) => ScanCode | null
  restoreCode: (code: ScanCode) => boolean
  finishSession: () => Promise<boolean>
  cancelSession: () => Promise<CancelledSessionSnapshot | null>
  restoreSession: (snapshot: CancelledSessionSnapshot) => void
  renameDistributor: (id: string, name: string) => boolean
  updateDistributorInfo: (id: string, patch: Pick<Partial<Distributor>, 'phone' | 'note'>) => void
  archiveDistributor: (id: string) => Promise<void>
  restoreDistributor: (id: string) => Promise<void>
  deleteDistributor: (id: string) => Promise<DistributorSnapshot | null>
  restoreDistributorSnapshot: (snapshot: DistributorSnapshot) => Promise<void>
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
          set({ ...data, sessions, ready: true })
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
        scannedAt: now,
        source,
        ...(moved[0]
          ? {
              movedFrom: {
                distributorId: moved[0].distributorId,
                distributorName: movedFromName,
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
          scannedAt: now,
          source,
          ...(sourceRecord
            ? {
                movedFrom: {
                  distributorId: sourceRecord.distributorId,
                  distributorName: distributorNames.get(sourceRecord.distributorId) ?? '',
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
      set({ distributors: [], sessions: [], codes: [], events: [] })
      await db.clearAllData()
    },

    importData: async (data, settingsPatch) => {
      const normalized: AllData = {
        distributors: data.distributors ?? [],
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
