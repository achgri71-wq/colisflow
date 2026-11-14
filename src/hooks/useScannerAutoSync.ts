import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { useStore } from '../store/useStore'
import { useToast } from '../components/Toast'
import {
  buildFlowPayload,
  fetchReturnStatuses,
  fetchScanDistributors,
  getScannerAuth,
  linkUrlFor,
  publishFlowDistributors,
  saveReturnStatuses,
} from '../lib/colisScanner'
import { formatNumber } from '../lib/utils'

const SYNC_INTERVAL_MS = 5 * 60 * 1000
const INITIAL_DELAY_MS = 4000
const MIN_GAP_MS = 60 * 1000

/**
 * Background bridges:
 * 1. Colis Scanner: its shared distributor lists are fetched and merged into
 *    ColisFlow automatically when a Colis Scanner account is connected.
 * 2. Return Scanner Pro: ColisFlow publishes its distributor lists to the
 *    shared SUD server and reads back the return statuses RSP published.
 *
 * Both run shortly after startup, then every few minutes while the app is
 * visible and online. Failures are silent and retried on the next tick.
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
    const timers: number[] = []

    const sync = async () => {
      if (stopped || busy.current) return
      if (!navigator.onLine) return
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastSync.current < MIN_GAP_MS) return

      const settings = useStore.getState().settings
      const apiKey = settings.sudKey.trim()
      const hasScanner = Boolean(getScannerAuth())
      if (!hasScanner && !apiKey) return

      busy.current = true
      try {
        if (hasScanner) {
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
        }

        if (apiKey) {
          // Direct link with Return Scanner Pro through the shared server.
          const linkUrl = linkUrlFor(settings.sudUrl)
          const state = useStore.getState()
          await publishFlowDistributors(
            linkUrl,
            apiKey,
            buildFlowPayload(state.distributors, state.codes),
          )
          const statuses = await fetchReturnStatuses(linkUrl, apiKey)
          if (!stopped) saveReturnStatuses(statuses)
        }
      } catch {
        /* offline or unreachable server: silent, retried later */
      } finally {
        busy.current = false
      }
    }

    const tick = () => void sync()

    timers.push(window.setTimeout(tick, INITIAL_DELAY_MS))
    timers.push(window.setInterval(tick, SYNC_INTERVAL_MS))
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('online', tick)

    return () => {
      stopped = true
      for (const id of timers) {
        clearTimeout(id)
        clearInterval(id)
      }
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('online', tick)
    }
  }, [enabled, toast])
}
