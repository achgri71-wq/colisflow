import type { TranslationKey } from '../i18n/dict'

/**
 * Client for the SUD Delivery bridge (api/colisflow.php on suddelivery.net).
 * The bridge is the only piece that talks to the SUD database; it needs the
 * shared API key that lives in ColisFlow settings.
 */

export const DEFAULT_SUD_URL = 'https://suddelivery.net/api/colisflow.php'

export interface SudLivreur {
  id: string
  name: string
}

export interface SudBrlInfo {
  code: string
  count: number
  date: number
}

export interface SudCreateResult {
  brl: string | null
  livreur: SudLivreur
  total: number
  added: number
  already: number
  missing: string[]
}

export interface SudSentEntry {
  at: string
  brl: string | null
}

export type SudSentMap = Record<string, SudSentEntry>

const SENT_KEY = 'colisflow.sud.sent'

/** Accent- and case-insensitive name normalisation (keeps Arabic letters). */
export function normalizeName(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Finds the SUD livreur whose name matches a ColisFlow distributor name. */
export function matchLivreur(name: string, livreurs: SudLivreur[]): SudLivreur | null {
  const needle = normalizeName(name)
  if (!needle) return null

  const exact = livreurs.find((livreur) => normalizeName(livreur.name) === needle)
  if (exact) return exact

  const tokens = needle.split(' ').filter(Boolean)
  if (!tokens.length) return null

  let best: { livreur: SudLivreur; score: number } | null = null
  for (const livreur of livreurs) {
    const targetTokens = new Set(normalizeName(livreur.name).split(' ').filter(Boolean))
    if (!targetTokens.size) continue
    const hits = tokens.filter((token) => targetTokens.has(token)).length
    if (!hits) continue
    const coverage = hits / tokens.length
    const strong = tokens.length === 1 || hits >= 2 || coverage >= 0.6
    if (strong && (!best || coverage > best.score)) {
      best = { livreur, score: coverage }
    }
  }
  return best?.livreur ?? null
}

function joinUrl(base: string, query: string): string {
  const trimmed = base.trim().replace(/\/+$/, '')
  return query ? `${trimmed}?${query}` : trimmed
}

async function request<T>(
  url: string,
  key: string,
  init?: { method: string; body: string },
): Promise<T> {
  const response = await fetch(url, {
    method: init?.method ?? 'GET',
    body: init?.body,
    headers: init?.body
      ? { 'X-Api-Key': key, 'Content-Type': 'application/json' }
      : { 'X-Api-Key': key },
  })

  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  const data = payload as { ok?: boolean; error?: string } | null
  if (!response.ok || !data || data.ok !== true) {
    throw new Error(data?.error ?? `http-${response.status}`)
  }
  return payload as T
}

export async function sudPing(apiUrl: string, apiKey: string): Promise<void> {
  await request(joinUrl(apiUrl, 'action=ping'), apiKey)
}

export async function sudLivreurs(apiUrl: string, apiKey: string): Promise<SudLivreur[]> {
  const data = await request<{ livreurs?: SudLivreur[] }>(
    joinUrl(apiUrl, 'action=livreurs'),
    apiKey,
  )
  return Array.isArray(data.livreurs) ? data.livreurs : []
}

export async function sudOpenBrl(
  apiUrl: string,
  apiKey: string,
  dlm: string,
): Promise<SudBrlInfo | null> {
  const data = await request<{ brl?: SudBrlInfo | null }>(
    joinUrl(apiUrl, `action=brl&dlm=${encodeURIComponent(dlm)}`),
    apiKey,
  )
  return data.brl ?? null
}

export async function sudCreateBrl(
  apiUrl: string,
  apiKey: string,
  dlm: string,
  codes: string[],
): Promise<SudCreateResult> {
  return request<SudCreateResult>(joinUrl(apiUrl, 'action=create'), apiKey, {
    method: 'POST',
    body: JSON.stringify({ action: 'create', dlm, codes }),
  })
}

export function loadSentMap(): SudSentMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SENT_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? (parsed as SudSentMap) : {}
  } catch {
    return {}
  }
}

export function saveSentMap(map: SudSentMap): void {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(map))
  } catch {
    /* storage may be unavailable */
  }
}

export function markSent(
  map: SudSentMap,
  codeIds: string[],
  brl: string | null,
  at: string = new Date().toISOString(),
): SudSentMap {
  const next = { ...map }
  for (const id of codeIds) {
    next[id] = { at, brl }
  }
  return next
}

export const SUD_ERROR_KEYS: Record<string, TranslationKey> = {
  unauthorized: 'sud.errAuth',
  'livreur-not-found': 'sud.errLivreur',
  'dlm-required': 'sud.errLivreur',
  'codes-required': 'sud.errCodes',
  'too-many-codes': 'sud.errTooMany',
  'unknown-action': 'sud.errServer',
  'server-error': 'sud.errServer',
  'database-unavailable': 'sud.errServer',
}

export function sudErrorKey(error: unknown): TranslationKey {
  const code = error instanceof Error ? error.message : String(error)
  return SUD_ERROR_KEYS[code] ?? 'sud.errNetwork'
}
