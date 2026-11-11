import { useEffect } from 'react'

interface WakeLockSentinelLike extends EventTarget {
  release: () => Promise<void>
  released: boolean
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const wakeLock = (navigator as WakeLockNavigator).wakeLock
    if (!wakeLock) return

    let sentinel: WakeLockSentinelLike | null = null
    let disposed = false

    const request = async () => {
      if (disposed || document.visibilityState !== 'visible') return
      try {
        sentinel = await wakeLock.request('screen')
      } catch {
        /* permission denied or unsupported */
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) {
        void request()
      }
    }

    void request()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (sentinel) void sentinel.release().catch(() => undefined)
    }
  }, [enabled])
}
