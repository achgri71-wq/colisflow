import type { Language } from '../types'

export function uid(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
  return prefix ? `${prefix}_${raw}` : raw
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function localeFor(lang: Language): string {
  if (lang === 'ar') return 'ar-MA'
  if (lang === 'en') return 'en-GB'
  return 'fr-FR'
}

export function formatNumber(value: number, lang: Language): string {
  return new Intl.NumberFormat(localeFor(lang)).format(value)
}

export function formatPercent(value: number, lang: Language): string {
  return new Intl.NumberFormat(localeFor(lang), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(
  input: string | Date,
  lang: Language,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  return new Intl.DateTimeFormat(localeFor(lang), options).format(new Date(input))
}

export function formatTime(input: string | Date, lang: Language): string {
  return new Intl.DateTimeFormat(localeFor(lang), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(input))
}

export function formatDateTime(input: string | Date, lang: Language): string {
  return new Intl.DateTimeFormat(localeFor(lang), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(input))
}

export function formatWeekday(input: string | Date, lang: Language): string {
  return new Intl.DateTimeFormat(localeFor(lang), { weekday: 'short' }).format(new Date(input))
}

export function formatDayMonth(input: string | Date, lang: Language): string {
  return new Intl.DateTimeFormat(localeFor(lang), { day: '2-digit', month: 'short' }).format(
    new Date(input),
  )
}

export function relativeTime(input: string | Date, lang: Language): string {
  const then = new Date(input).getTime()
  const diff = then - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(localeFor(lang), { numeric: 'auto' })

  if (abs < 45_000) {
    if (lang === 'ar') return 'الآن'
    if (lang === 'en') return 'just now'
    return "à l'instant"
  }
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute')
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour')
  if (abs < 7 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day')
  return formatDate(input, lang)
}

export function startOfDay(input: string | Date = new Date()): Date {
  const date = new Date(input)
  date.setHours(0, 0, 0, 0)
  return date
}

export function addDays(input: string | Date, days: number): Date {
  const date = new Date(input)
  date.setDate(date.getDate() + days)
  return date
}

export function dayKey(input: string | Date): string {
  const date = new Date(input)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isToday(input: string | Date): boolean {
  return dayKey(input) === dayKey(new Date())
}

export function secondsToClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts = [m, s].map((n) => String(n).padStart(2, '0'))
  if (h > 0) parts.unshift(String(h).padStart(2, '0'))
  return parts.join(':')
}

export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  if (!parts.length) return '?'
  return parts.map((part) => Array.from(part)[0] ?? '').join('').toUpperCase()
}

export function hueFromId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360
  }
  return hash
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0
  return part / total
}

export function sanitizeFilename(name: string): string {
  return (
    name
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 80) || 'export'
  )
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function downloadJson(data: unknown, filename: string): void {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }),
    filename,
  )
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  )
}

let audioContext: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    if (!audioContext) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      audioContext = new Ctor()
    }
    if (audioContext.state === 'suspended') void audioContext.resume()
    return audioContext
  } catch {
    return null
  }
}

export type Tone = 'success' | 'error' | 'warning' | 'move' | 'tap'

const TONES: Record<Tone, { f1: number; f2?: number; duration: number; wave: OscillatorType }> = {
  success: { f1: 880, f2: 1320, duration: 0.18, wave: 'sine' },
  error: { f1: 240, duration: 0.22, wave: 'square' },
  warning: { f1: 520, f2: 660, duration: 0.24, wave: 'triangle' },
  move: { f1: 440, f2: 780, duration: 0.3, wave: 'triangle' },
  tap: { f1: 660, duration: 0.08, wave: 'sine' },
}

export function playTone(tone: Tone): void {
  const ctx = audio()
  if (!ctx) return
  try {
    const t = ctx.currentTime
    const spec = TONES[tone]
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = spec.wave
    osc.frequency.setValueAtTime(spec.f1, t)
    if (spec.f2) osc.frequency.exponentialRampToValueAtTime(spec.f2, t + spec.duration * 0.5)
    gain.gain.setValueAtTime(0.18, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + spec.duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + spec.duration)
  } catch {
    /* audio is a nice-to-have */
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* ignore */
  }
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function storageLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
