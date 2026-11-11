import { useEffect, useRef } from 'react'
import { extractCode } from '../lib/codes'
import { ScanDeduplicator } from '../lib/scanDedupe'
import { isTypingTarget } from '../lib/utils'

/** Fastest gap allowed between two characters of one hardware scan. */
const KEY_GAP_MS = 300
/** Flush a scan when the scanner does not send Enter/Tab. */
const IDLE_FLUSH_MS = 220
/** Ignore repeat bursts from the same code (double trigger, key bounce). */
const DEDUPE_MS = 900
const MIN_LENGTH = 4
const MAX_LENGTH = 160

/**
 * Listens for USB/Bluetooth barcode scanners that behave like keyboards.
 * Scanners emit characters very fast, then Enter (or a short idle gap).
 */
export function useHidScanner(onScan: (code: string) => void, enabled = true): void {
  const callbackRef = useRef(onScan)
  callbackRef.current = onScan

  useEffect(() => {
    if (!enabled) return

    const dedupe = new ScanDeduplicator(DEDUPE_MS)
    let buffer = ''
    let lastKeyAt = 0
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    const clearIdle = () => {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
    }

    const reset = () => {
      clearIdle()
      buffer = ''
    }

    const flush = () => {
      clearIdle()
      const code = extractCode(buffer)
      buffer = ''
      if (code.length < MIN_LENGTH) return
      if (!dedupe.accept(code)) return
      callbackRef.current(code)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return
      if (event.isComposing || event.repeat) return
      if (isTypingTarget(event.target)) return
      if (document.querySelector('.modal-backdrop')) return

      if (event.key === 'Escape') {
        reset()
        return
      }

      const now = Date.now()
      if (now - lastKeyAt > KEY_GAP_MS) buffer = ''
      lastKeyAt = now

      if (event.key === 'Enter' || event.key === 'Tab') {
        if (buffer.length >= MIN_LENGTH) {
          event.preventDefault()
          event.stopPropagation()
          flush()
        } else {
          reset()
        }
        return
      }

      if (event.key.length !== 1 || event.key === ' ') return

      if (buffer.length >= MAX_LENGTH) reset()
      buffer += event.key
      clearIdle()
      idleTimer = setTimeout(() => {
        idleTimer = null
        if (buffer.length >= MIN_LENGTH) flush()
        else buffer = ''
      }, IDLE_FLUSH_MS)
    }

    const onBlur = () => reset()
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') reset()
    }

    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      clearIdle()
    }
  }, [enabled])
}
