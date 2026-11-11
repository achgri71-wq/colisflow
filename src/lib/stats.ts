import type { Distributor, ScanCode, ScanSession } from '../types'
import { addDays, dayKey, percent } from './utils'
import { isSendit } from './codes'

export interface DistributorStats {
  parcels: number
  sendit: number
  sessions: number
  lastScan?: string
}

export interface DashboardSummary {
  totalParcels: number
  todayParcels: number
  yesterdayParcels: number
  todayDelta: number | null
  activeDistributors: number
  archivedDistributors: number
  totalSessions: number
  senditParcels: number
  senditShare: number
  activeSession?: ScanSession
}

export interface DailyPoint {
  date: string
  count: number
  sendit: number
}

export interface TopDistributor {
  distributor: Distributor
  parcels: number
  sendit: number
}

export function distributorStats(
  codes: ScanCode[],
  sessions: ScanSession[],
  distributorId: string,
  prefixes?: string[],
): DistributorStats {
  let parcels = 0
  let sendit = 0
  let lastScan: string | undefined
  for (const code of codes) {
    if (code.distributorId !== distributorId) continue
    parcels += 1
    if (isSendit(code.code, prefixes)) sendit += 1
    if (!lastScan || code.scannedAt > lastScan) lastScan = code.scannedAt
  }
  const sessionCount = sessions.filter(
    (session) => session.distributorId === distributorId && session.status !== 'cancelled',
  ).length
  return { parcels, sendit, sessions: sessionCount, lastScan }
}

export function summary(
  distributors: Distributor[],
  sessions: ScanSession[],
  codes: ScanCode[],
  prefixes?: string[],
): DashboardSummary {
  const today = dayKey(new Date())
  const yesterday = dayKey(addDays(new Date(), -1))
  let todayParcels = 0
  let yesterdayParcels = 0
  let senditParcels = 0

  for (const code of codes) {
    const key = dayKey(code.scannedAt)
    if (key === today) todayParcels += 1
    else if (key === yesterday) yesterdayParcels += 1
    if (isSendit(code.code, prefixes)) senditParcels += 1
  }

  const todayDelta =
    yesterdayParcels > 0
      ? (todayParcels - yesterdayParcels) / yesterdayParcels
      : todayParcels > 0
        ? 1
        : null

  return {
    totalParcels: codes.length,
    todayParcels,
    yesterdayParcels,
    todayDelta,
    activeDistributors: distributors.filter((distributor) => !distributor.archived).length,
    archivedDistributors: distributors.filter((distributor) => distributor.archived).length,
    totalSessions: sessions.filter((session) => session.status !== 'cancelled').length,
    senditParcels,
    senditShare: percent(senditParcels, codes.length),
    activeSession: sessions.find((session) => session.status === 'active'),
  }
}

export function dailySeries(
  codes: ScanCode[],
  days: number,
  prefixes?: string[],
  now: Date = new Date(),
): DailyPoint[] {
  const points: DailyPoint[] = []
  const index = new Map<string, DailyPoint>()

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(now, -offset)
    const key = dayKey(date)
    const point: DailyPoint = { date: key, count: 0, sendit: 0 }
    points.push(point)
    index.set(key, point)
  }

  for (const code of codes) {
    const point = index.get(dayKey(code.scannedAt))
    if (!point) continue
    point.count += 1
    if (isSendit(code.code, prefixes)) point.sendit += 1
  }

  return points
}

export function topDistributors(
  distributors: Distributor[],
  codes: ScanCode[],
  limit = 5,
  prefixes?: string[],
): TopDistributor[] {
  const byId = new Map<string, { parcels: number; sendit: number }>()
  for (const code of codes) {
    const entry = byId.get(code.distributorId) ?? { parcels: 0, sendit: 0 }
    entry.parcels += 1
    if (isSendit(code.code, prefixes)) entry.sendit += 1
    byId.set(code.distributorId, entry)
  }

  return distributors
    .filter((distributor) => !distributor.archived)
    .map((distributor) => {
      const entry = byId.get(distributor.id) ?? { parcels: 0, sendit: 0 }
      return { distributor, parcels: entry.parcels, sendit: entry.sendit }
    })
    .filter((entry) => entry.parcels > 0)
    .sort((a, b) => b.parcels - a.parcels)
    .slice(0, limit)
}

export function senditSplit(codes: ScanCode[], prefixes?: string[]) {
  const sendit = codes.filter((code) => isSendit(code.code, prefixes)).length
  return {
    sendit,
    standard: codes.length - sendit,
    total: codes.length,
    share: percent(sendit, codes.length),
  }
}

export function countSessionCodes(codes: ScanCode[], sessionId: string): number {
  let count = 0
  for (const code of codes) if (code.sessionId === sessionId) count += 1
  return count
}
