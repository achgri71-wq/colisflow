import type { TranslationKey } from '../i18n/dict'
import type { ScanDistributor } from '../types'
import { extractCode, uniqueCodes } from './codes'

/**
 * Read-only bridge to the Colis Scanner app (colisscan.web.app).
 *
 * Colis Scanner keeps its distributor lists in a shared Firebase Realtime
 * Database. We talk to Firebase directly through its REST endpoints with the
 * same email/password account, so nothing has to change inside Colis Scanner:
 * ColisFlow signs in and imports the shared distributor lists.
 */

const API_KEY = 'AIzaSyDFZCPczQ_xceK-lJHx70BHAxlQFJpP4uY'
const DATABASE_URL = 'https://colisscan-default-rtdb.firebaseio.com'
const AUTH_URL = 'https://identitytoolkit.googleapis.com/v1'
const TOKEN_URL = 'https://securetoken.googleapis.com/v1'
const STORAGE_KEY = 'colisflow.scan.auth'

export interface ScannerAuth {
  email: string
}

interface StoredAuth {
  email: string
  refreshToken: string
}

let cachedToken: { idToken: string; expiresAt: number } | null = null

const ERROR_KEYS: Record<string, TranslationKey> = {
  'invalid-credentials': 'scanlink.errAuth',
  unauthenticated: 'scanlink.errAuthState',
  'network-error': 'scanlink.errNetwork',
  'server-error': 'scanlink.errNetwork',
}

/** Maps a thrown bridge error to its translation key (falls back to network). */
export function scannerErrorKey(error: unknown): TranslationKey {
  const code = error instanceof Error ? error.message : String(error)
  return ERROR_KEYS[code] ?? 'scanlink.errNetwork'
}

function loadStored(): StoredAuth | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!parsed || typeof parsed !== 'object') return null
    const stored = parsed as Partial<StoredAuth>
    if (typeof stored.email !== 'string' || typeof stored.refreshToken !== 'string') return null
    return { email: stored.email, refreshToken: stored.refreshToken }
  } catch {
    return null
  }
}

function saveStored(stored: StoredAuth): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    /* storage may be unavailable */
  }
}

function clearStored(): void {
  cachedToken = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage may be unavailable */
  }
}

/** Returns the remembered Colis Scanner account, without touching the network. */
export function getScannerAuth(): ScannerAuth | null {
  const stored = loadStored()
  return stored ? { email: stored.email } : null
}

export function signOutScanner(): void {
  clearStored()
}

async function postJson<T>(url: string, body: unknown, contentType = 'application/json'): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!response.ok) {
    const error = (payload as { error?: { message?: string } } | null)?.error?.message ?? ''
    throw { status: response.status, message: error, payload }
  }
  return (payload ?? {}) as T
}

/** Signs in with the Colis Scanner Firebase account and remembers the session. */
export async function signInScanner(email: string, password: string): Promise<ScannerAuth> {
  let payload: { idToken?: string; refreshToken?: string; email?: string; expiresIn?: string }
  try {
    payload = await postJson(`${AUTH_URL}/accounts:signInWithPassword?key=${API_KEY}`, {
      email: email.trim(),
      password,
      returnSecureToken: true,
    })
  } catch (error) {
    const status = (error as { status?: number; message?: string } | null)?.status
    const message = (error as { message?: string } | null)?.message ?? ''
    const rejected =
      status === 400 &&
      /INVALID|EMAIL_NOT_FOUND|USER_DISABLED|OPERATION_NOT_ALLOWED/.test(message)
    throw new Error(rejected ? 'invalid-credentials' : 'network-error')
  }

  const idToken = payload.idToken
  const refreshToken = payload.refreshToken
  if (!idToken || !refreshToken) throw new Error('server-error')

  saveStored({ email: payload.email ?? email.trim(), refreshToken })
  cachedToken = {
    idToken,
    expiresAt: Date.now() + (Number(payload.expiresIn) || 3600) * 1000,
  }
  return { email: payload.email ?? email.trim() }
}

async function refreshAccessToken(refreshToken: string): Promise<{ idToken: string; expiresIn: number; refreshToken: string }> {
  let payload: { access_token?: string; id_token?: string; expires_in?: string; refresh_token?: string }
  try {
    payload = await postJson(
      `${TOKEN_URL}/token?key=${API_KEY}`,
      `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
      'application/x-www-form-urlencoded',
    )
  } catch {
    throw new Error('network-error')
  }

  const idToken = payload.id_token ?? payload.access_token
  if (!idToken) {
    // The remembered session is no longer valid: forget it.
    clearStored()
    throw new Error('unauthenticated')
  }
  return {
    idToken,
    expiresIn: Number(payload.expires_in) || 3600,
    refreshToken: payload.refresh_token ?? refreshToken,
  }
}

async function ensureAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.idToken
  const stored = loadStored()
  if (!stored) {
    cachedToken = null
    throw new Error('unauthenticated')
  }
  const refreshed = await refreshAccessToken(stored.refreshToken)
  if (refreshed.refreshToken !== stored.refreshToken) {
    saveStored({ email: stored.email, refreshToken: refreshed.refreshToken })
  }
  cachedToken = { idToken: refreshed.idToken, expiresAt: Date.now() + refreshed.expiresIn * 1000 }
  return refreshed.idToken
}

/** Reads the shared distributor lists from the Colis Scanner database. */
export async function fetchScanDistributors(): Promise<ScanDistributor[]> {
  const idToken = await ensureAccessToken()

  let payload: unknown
  try {
    const response = await fetch(`${DATABASE_URL}/distributors.json?auth=${encodeURIComponent(idToken)}`)
    if (response.status === 401 || response.status === 403) throw new Error('unauthenticated')
    if (!response.ok) throw new Error('server-error')
    const text = await response.text()
    payload = text ? JSON.parse(text) : null
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'unauthenticated' || code === 'server-error') throw error
    throw new Error('network-error')
  }

  return normalizeScanDistributors(payload)
}

function codesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => extractCode(String(entry ?? '')))
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map((entry) => extractCode(String(entry ?? '')))
  }
  if (typeof value === 'string') {
    return value.split(/[\n\r,;\t]+/).map((entry) => extractCode(entry))
  }
  return []
}

/**
 * Normalises the raw Realtime Database payload. Firebase may return the codes
 * either as an array or as an object map, and distributors as a map keyed by id.
 */
export function normalizeScanDistributors(raw: unknown): ScanDistributor[] {
  const entries: [string, unknown][] = Array.isArray(raw)
    ? raw.map((value, index) => [String(index), value])
    : raw && typeof raw === 'object'
      ? Object.entries(raw as Record<string, unknown>)
      : []

  const result: ScanDistributor[] = []
  for (const [key, value] of entries) {
    if (!value || typeof value !== 'object') continue
    const record = value as {
      id?: unknown
      name?: unknown
      codes?: unknown
      date?: unknown
      archived?: unknown
      deletedAt?: unknown
    }
    const name = String(record.name ?? '').trim()
    if (!name) continue

    const rawDate = typeof record.date === 'string' ? record.date : undefined
    const date = rawDate && !Number.isNaN(Date.parse(rawDate)) ? rawDate : undefined

    result.push({
      id: String(record.id ?? key),
      name,
      codes: uniqueCodes(codesOf(record.codes)),
      date,
      archived: Boolean(record.archived) || Boolean(record.deletedAt),
    })
  }

  result.sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1
    return (b.date ?? '').localeCompare(a.date ?? '')
  })
  return result
}
