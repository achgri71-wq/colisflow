import { useEffect, useRef } from 'react'
import { openDB, type IDBPDatabase } from 'idb'
import { useI18n } from '../i18n'
import { useStore } from '../store/useStore'
import { useToast } from '../components/Toast'
import { getCloudLinkSlot, putCloudLinkSlot } from '../lib/cloudLink'
import {
  buildFlowPayload,
  fetchScanDistributors,
  getScannerAuth,
  parseReturnStatuses,
  saveReturnStatuses,
  scannerErrorKey,
} from '../lib/colisScanner'
import { formatNumber } from '../lib/utils'

const SYNC_INTERVAL_MS = 2 * 60 * 1000
const INITIAL_DELAY_MS = 1200
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
 * 2. Return Scanner Pro: publish distributor lists and read return statuses
 *    through TextDB for cross-device sync, while keeping IndexedDB and
 *    BroadcastChannel as the instant same-browser/offline path.
 */
export function useScannerAutoSync(enabled: boolean): void {
  const importFromScanner = useStore((state) => state.importFromScanner)
  const logSync = useStore((state) => state.logSync)
  const toast = useToast()
  const { t, lang } = useI18n()

  const busy = useRef(false)
  const lastSync = useRef(0)
  const importRef = useRef(importFromScanner)
  importRef.current = importFromScanner
  const logRef = useRef(logSync)
  logRef.current = logSync
  const localeRef = useRef({ t, lang })
  localeRef.current = { t, lang }

  useEffect(() => {
    if (!enabled) return
    let stopped = false

    const syncLink = async () => {
      const state = useStore.getState()
      const flowPayload = buildFlowPayload(state.distributors, state.codes)
      const flowAt = new Date().toISOString()
      await getLinkDB().then((db) =>
        db.put('slots', {
          slot: 'flow',
          at: flowAt,
          data: flowPayload,
        }),
      )
      notify()

      // Keep the same-device link for instant updates, and publish the exact
      // same snapshot to TextDB so RSP can import it from another device.
      try {
        await putCloudLinkSlot('flow', flowPayload)
      } catch (error) {
        console.warn('ColisFlow cloud publish failed:', error)
      }

      try {
        const cloudRsp = await getCloudLinkSlot('rsp')
        if (!stopped && cloudRsp) {
          saveReturnStatuses(parseReturnStatuses(cloudRsp.data))
          await getLinkDB().then((db) =>
            db.put('slots', { slot: 'rsp', at: cloudRsp.at, data: cloudRsp.data }),
          )
          return
        }
      } catch (error) {
        console.warn('RSP cloud status read failed:', error)
      }

      const localRsp = await getLinkDB().then((db) => db.get('slots', 'rsp'))
      if (!stopped && localRsp) saveReturnStatuses(parseReturnStatuses(localRsp.data))
    }

    const sync = async () => {
      if (stopped || busy.current) return
      if (document.visibilityState !== 'visible') return

      const hasScanner = Boolean(getScannerAuth())
      const publishLink = async () => {
        if (stopped) return
        try {
          // Always publish to the local link and cloud even when ColisScan
          // authentication/network access is unavailable.
          await syncLink()
        } catch {
          /* local link will be retried on the next tick/state change */
        }
      }

      if (!hasScanner) {
        await publishLink()
        logRef.current({ status: 'no-account', lists: 0, codes: 0, added: 0, moved: 0 })
        return
      }

      if (!navigator.onLine) {
        await publishLink()
        logRef.current({ status: 'offline', lists: 0, codes: 0, added: 0, moved: 0 })
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
        logRef.current({
          status: 'ok',
          lists: items.length,
          codes: items.reduce((sum, item) => sum + item.codes.length, 0),
          added: result.added,
          moved: result.moved,
          names: result.names,
        })
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
      } catch (cause) {
        // Offline or expired session: silent for the operator, recorded for the
        // activity panel so a broken link is visible instead of invisible.
        logRef.current({
          status: 'error',
          lists: 0,
          codes: 0,
          added: 0,
          moved: 0,
          message: scannerErrorKey(cause),
        })
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
    // The Colis Scanner dialog asks for an immediate import once it has the
    // lists, so nothing has to be pressed there.
    const onSyncNow = () => void sync()
    window.addEventListener('colisflow:sync-now', onSyncNow)

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
      window.removeEventListener('colisflow:sync-now', onSyncNow)
    }
  }, [enabled, toast])
}
