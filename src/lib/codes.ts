import type { Language } from '../types'

export const DEFAULT_SENDIT_PREFIXES = ['DH', 'DXH', 'DSH']

export type CodeKind = 'sendit' | 'standard'

/**
 * Extracts the actual tracking code from scanner output.
 * Sendit share links look like https://app.sendit.ma/deliveries/DH123456789
 */
export function extractCode(raw: string): string {
  let value = String(raw ?? '').trim()
  if (!value) return ''
  value = value.replace(/[\u200B-\u200D\uFEFF]/g, '')

  const looksLikeUrl =
    /^https?:\/\//i.test(value) || /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\//i.test(value)

  if (looksLikeUrl) {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
    try {
      const url = new URL(withProtocol)
      const segment = url.pathname.split('/').filter(Boolean).pop()
      if (segment) return decodeURIComponent(segment).trim()
    } catch {
      /* keep the raw value */
    }
  }

  return value
}

export function isSendit(code: string, prefixes: string[] = DEFAULT_SENDIT_PREFIXES): boolean {
  const normalized = String(code ?? '').trim().toUpperCase()
  if (!normalized) return false
  return prefixes.some((prefix) => prefix && normalized.startsWith(prefix.toUpperCase()))
}

export function codeKind(code: string, prefixes?: string[]): CodeKind {
  return isSendit(code, prefixes) ? 'sendit' : 'standard'
}

export function parseCodeBlob(text: string): string[] {
  return String(text ?? '')
    .split(/[\n\r,;\t]+/)
    .map((line) => extractCode(line))
    .filter(Boolean)
}

export function uniqueCodes(codes: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const code of codes) {
    if (!code || seen.has(code)) continue
    seen.add(code)
    result.push(code)
  }
  return result
}

export function groupCodesForExport(
  codes: string[],
  prefixes?: string[],
): { sendit: string[]; standard: string[] } {
  const sendit: string[] = []
  const standard: string[] = []
  for (const code of codes) {
    if (isSendit(code, prefixes)) sendit.push(code)
    else standard.push(code)
  }
  return { sendit, standard }
}

export function isLikelyCode(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false
  const text = String(value).trim()
  if (text.length < 3 || text.length > 160) return false
  if (/^(total|code|tracking|suivi|colis|parcel|sendit)$/i.test(text)) return false
  return /[0-9A-Za-z\u0600-\u06FF]/.test(text)
}

export function senditPrefixesFromInput(input: string): string[] {
  return uniqueCodes(
    input
      .split(/[\s,;]+/)
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean),
  )
}

export function codeTypeLabel(kind: CodeKind, lang: Language): string {
  if (kind === 'sendit') return 'Sendit'
  if (lang === 'ar') return 'عادي'
  if (lang === 'en') return 'Standard'
  return 'Standard'
}
