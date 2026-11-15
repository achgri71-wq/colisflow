import { useEffect, useRef } from 'react'
import { openDB, type IDBPDatabase } from 'idb'
import { useI18n } from '../i18n'
import { useStore } from '../store/useStore'
import { useToast } from '../components/Toast'
import {
  buildFlowPayload,
  fetchScanDistributors,
  getScannerAuth,
  parseReturnStatuses,
  saveReturnStatuses,
} from '../lib/colisScanner'
import { formatNumber } from '../lib/utils'

const SYNC_INTERVAL_MS = 5 * 60 * 1000
const INITIAL_DELAY_MS = 4000
const MIN_GAP_MS = 60 * 1000

const LINK_DB = 'colislink'

interface SlotRecord {
  slot: 'flow' | 'rsp'
  at: string
  data: unknown
}

let linkDB: Promise<IDBPDatabase<{ slots: { key: string; value: SlotRecord } }>> | null = null
let channel: BroadcastChannel | null = null

function getLinkDB(): Promise<IDBPDatabase<{ slots: { key: string; value: SlotRecord } }>> {
  if (!linkDB) {
    linkDB = openDB(LINK_DB, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('slots')) db.createObjectStore('slots', { keyPath: 'slot' })
      },
    })
  }
  return linkDB
}

function notify(): void {
  try {
    if (!channel) channel = new BroadcastChannel('colislink')
    channel.postMessage({ t: Date.now() })
  } catch {
    /* BroadcastChannel may be unavailable */
  }
}

/** Listens for link updates coming from Return Scanner Pro. */
function onLinkUpdate(handler: () => void): () => void {
  try {
    if (!channel) channel = new BroadcastChannel('colislink')
    channel.onmessage = handler
  } catch {
    /* BroadcastChannel may be unavailable */
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', handler)
  return () => {
    if (channel) channel.onmessage = null
    if (typeof window !== 'undefined') window.removeEventListener('storage', handler)
  }
}

/**
 * Background bridges:
 * 1. Colis Scanner: its shared distributor lists are fetched and merged into
 *    ColisFlow automatically when a Colis Scanner account is connected.
 * 2. Return Scanner Pro: both apps are hosted on the same origin, so they
 *    share the browser storage — ColisFlow publishes its distributor lists
 *    into the shared database and reads back the return statuses RSP
 *    published. No server, works offline, instant via BroadcastChannel.
 */
export function useScannerAutoSync(enabled: boolean): void {
  const importFromScanner = useStore((state) => state.importFromScanner)
  const toast = useToast()
  const { t, lang } = useI18n()

  const busy = useRef(false)
  const lastSync = useRef(0)
  const importRef = useRef(importFromScanner)
  importRef.current = importFromScanner
  const localeRef = useRef({ t, lang })
  localeRef.current = { t, lang }

  useEffect(() => {
    if (!enabled) return
    let stopped = false

    const syncLink = async () => {
      const state = useStore.getState()
      await getLinkDB().then((db) =>
        db.put('slots', {
          slot: 'flow',
          at: new Date().toISOString(),
          data: buildFlowPayload(state.distributors, state.codes),
        }),
      )
      notify()
      const rsp = await getLinkDB().then((db) => db.get('slots', 'rsp'))
      if (!stopped && rsp) saveReturnStatuses(parseReturnStatuses(rsp.data))
    }

    const sync = async () => {
      if (stopped || busy.current) return
      if (document.visibilityState !== 'visible') return

      const hasScanner = Boolean(getScannerAuth())
      const publishLink = async () => {
        if (stopped) return
        try {
          // ColisFlow ↔ RSP uses local shared storage, not Firebase/network.
          // Always publish local data even when ColisScan auth/network fails.
          await syncLink()
        } catch {
          /* local link will be retried on the next tick/state change */
        }
      }

      if (!hasScanner || !navigator.onLine) {
        await publishLink()
        return
      }

      if (Date.now() - lastSync.current < MIN_GAP_MS) {
        // Scanner fetches are rate-limited, but local link publishing is not.
        await publishLink()
        return
      }

      busy.current = true
      try {
        const items = await fetchScanDistributors()
        if (stopped) return
        lastSync.current = Date.now()
        const result = await importRef.current(items)
        if (result.added > 0 || result.moved > 0) {
          const { t: translate, lang: language } = localeRef.current
          toast.push({
            title: translate('scanlink.autoTitle'),
            message: translate('scanlink.doneMsg', {
              created: formatNumber(result.created, language),
              codes: formatNumber(result.added, language),
              moved: formatNumber(result.moved, language),
            }),
            tone: 'info',
            duration: 7000,
          })
        }
      } catch {
        /* offline or expired session: silent, retried later */
      } finally {
        // Do not let a failed ColisScan request block ColisFlow → RSP sync.
        await publishLink()
        busy.current = false
      }
    }

    const tick = () => void sync()
    const offLink = onLinkUpdate(() => {
      // Refresh the return-status cache as soon as RSP publishes new data.
      void getLinkDB()
        .then((db) => db.get('slots', 'rsp'))
        .then((rsp) => {
          if (!stopped && rsp) saveReturnStatuses(parseReturnStatuses(rsp.data))
        })
        .catch(() => {})
    })

    // Publish the shared link as soon as the data changes (dates edited by
    // hand, codes added or moved), so Return Scanner Pro sees it in seconds
    // instead of waiting for the next scheduled tick.
    let pushTimer: number | null = null
    const pushSoon = () => {
      if (stopped) return
      if (pushTimer !== null) window.clearTimeout(pushTimer)
      pushTimer = window.setTimeout(() => {
        pushTimer = null
        if (!stopped) void syncLink()
      }, 2500)
    }
    const offStore = useStore.subscribe(pushSoon)

    const timers: number[] = []
    timers.push(window.setTimeout(tick, INITIAL_DELAY_MS))
    timers.push(window.setInterval(tick, SYNC_INTERVAL_MS))
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('online', tick)

    return () => {
      stopped = true
      offLink()
      offStore()
      if (pushTimer !== null) window.clearTimeout(pushTimer)
      for (const id of timers) {
        clearTimeout(id)
        clearInterval(id)
      }
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('online', tick)
    }
  }, [enabled, toast])
}
