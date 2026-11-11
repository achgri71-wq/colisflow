import { describe, expect, it } from 'vitest'
import type { Distributor, ScanCode, ScanSession } from '../types'
import { addDays, dayKey } from './utils'
import {
  countSessionCodes,
  dailySeries,
  distributorStats,
  senditSplit,
  summary,
  topDistributors,
} from './stats'

function distributor(id: string, name: string, archived = false): Distributor {
  return {
    id,
    name,
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
    archived,
    ...(archived ? { archivedAt: '2026-02-01T09:00:00.000Z' } : {}),
  }
}

function session(
  id: string,
  distributorId: string,
  status: ScanSession['status'] = 'completed',
): ScanSession {
  return {
    id,
    distributorId,
    distributorName: distributorId,
    startedAt: '2026-01-01T09:00:00.000Z',
    endedAt: status === 'active' ? undefined : '2026-01-01T10:00:00.000Z',
    status,
    source: 'camera',
  }
}

function code(
  id: string,
  value: string,
  distributorId: string,
  sessionId: string,
  scannedAt: string,
): ScanCode {
  return { id, code: value, distributorId, sessionId, scannedAt, source: 'camera' }
}

const distributors = [
  distributor('d1', 'Alpha'),
  distributor('d2', 'Beta'),
  distributor('d3', 'Gamma'),
  distributor('d4', 'Archived', true),
]

const sessions = [
  session('s1', 'd1', 'completed'),
  session('s2', 'd1', 'active'),
  session('s3', 'd1', 'cancelled'),
  session('s4', 'd2', 'completed'),
  session('s5', 'd3', 'completed'),
]

const now = new Date()
const yesterday = addDays(now, -1)
const threeDaysAgo = addDays(now, -3)

const codes = [
  code('c1', 'DH001', 'd1', 's1', now.toISOString()),
  code('c2', 'ABC123', 'd1', 's1', now.toISOString()),
  code('c3', 'DSH777', 'd1', 's2', yesterday.toISOString()),
  code('c4', 'XYZ999', 'd2', 's4', yesterday.toISOString()),
  code('c5', 'DH555', 'd3', 's5', threeDaysAgo.toISOString()),
  code('c6', 'OLD111', 'd4', 's9', '2020-01-01T12:00:00.000Z'),
]

describe('distributorStats', () => {
  it('counts parcels and Sendit codes for one distributor', () => {
    const stats = distributorStats(codes, sessions, 'd1')
    expect(stats.parcels).toBe(3)
    expect(stats.sendit).toBe(2)
  })

  it('excludes cancelled sessions but keeps active ones', () => {
    expect(distributorStats(codes, sessions, 'd1').sessions).toBe(2)
  })

  it('returns the latest scan timestamp', () => {
    const stats = distributorStats(codes, sessions, 'd1')
    expect(stats.lastScan).toBe(now.toISOString())
  })

  it('respects custom Sendit prefixes', () => {
    const stats = distributorStats(codes, sessions, 'd1', ['ABC'])
    expect(stats.sendit).toBe(1)
  })

  it('returns zeroed stats for unknown distributors', () => {
    expect(distributorStats(codes, sessions, 'missing')).toEqual({
      parcels: 0,
      sendit: 0,
      sessions: 0,
      lastScan: undefined,
    })
  })
})

describe('summary', () => {
  it('aggregates totals, distributors, sessions and Sendit share', () => {
    const dash = summary(distributors, sessions, codes)
    expect(dash.totalParcels).toBe(6)
    expect(dash.activeDistributors).toBe(3)
    expect(dash.archivedDistributors).toBe(1)
    expect(dash.totalSessions).toBe(4)
    expect(dash.senditParcels).toBe(3)
    expect(dash.senditShare).toBeCloseTo(0.5)
  })

  it('computes today, yesterday and the daily delta', () => {
    const dash = summary(distributors, sessions, codes)
    expect(dash.todayParcels).toBe(2)
    expect(dash.yesterdayParcels).toBe(2)
    expect(dash.todayDelta).toBe(0)
  })

  it('exposes the active session when present', () => {
    expect(summary(distributors, sessions, codes).activeSession?.id).toBe('s2')
  })

  it('reports a null delta when there was no activity yesterday or today', () => {
    const dash = summary(distributors, [], [])
    expect(dash.todayDelta).toBeNull()
    expect(dash.senditShare).toBe(0)
    expect(dash.activeSession).toBeUndefined()
  })

  it('treats a first active day as 100% growth', () => {
    const dash = summary([], [], [code('x', 'DH1', 'd1', 's1', new Date().toISOString())])
    expect(dash.todayDelta).toBe(1)
  })
})

describe('dailySeries', () => {
  it('builds a continuous window ending today', () => {
    const points = dailySeries(codes, 5, undefined, new Date(2026, 9, 26, 12))
    expect(points).toHaveLength(5)
    expect(points[0].date).toBe('2026-10-22')
    expect(points[4].date).toBe('2026-10-26')
  })

  it('buckets counts and Sendit totals per day', () => {
    const base = new Date(2026, 9, 26, 12)
    const seriesCodes = [
      code('a', 'DH1', 'd1', 's1', new Date(2026, 9, 24, 10).toISOString()),
      code('b', 'ABC', 'd1', 's1', new Date(2026, 9, 24, 18).toISOString()),
      code('c', 'DH2', 'd1', 's1', new Date(2026, 9, 26, 8).toISOString()),
      code('d', 'DH3', 'd1', 's1', new Date(2026, 9, 1, 8).toISOString()),
    ]
    const points = dailySeries(seriesCodes, 5, undefined, base)
    const byDate = Object.fromEntries(points.map((point) => [point.date, point]))
    expect(byDate['2026-10-24']).toMatchObject({ count: 2, sendit: 1 })
    expect(byDate['2026-10-26']).toMatchObject({ count: 1, sendit: 1 })
    expect(byDate['2026-10-25']).toMatchObject({ count: 0, sendit: 0 })
    // Outside the requested window.
    expect(points.reduce((total, point) => total + point.count, 0)).toBe(3)
  })

  it('returns an empty array for non-positive windows', () => {
    expect(dailySeries(codes, 0)).toEqual([])
    expect(dailySeries(codes, -3)).toEqual([])
  })
})

describe('topDistributors', () => {
  it('sorts by parcel count and excludes archived or empty distributors', () => {
    const top = topDistributors(distributors, codes)
    expect(top.map((entry) => entry.distributor.id)).toEqual(['d1', 'd2', 'd3'])
    expect(top[0]).toMatchObject({ parcels: 3, sendit: 2 })
  })

  it('honours the limit and custom prefixes', () => {
    const top = topDistributors(distributors, codes, 1, ['ABC'])
    expect(top).toHaveLength(1)
    expect(top[0]).toMatchObject({ parcels: 3, sendit: 1 })
  })

  it('returns an empty list when nothing matches', () => {
    expect(topDistributors([], codes)).toEqual([])
  })
})

describe('senditSplit', () => {
  it('splits codes into Sendit and standard counts', () => {
    expect(senditSplit(codes)).toEqual({
      sendit: 3,
      standard: 3,
      total: 6,
      share: 0.5,
    })
  })

  it('handles empty input without dividing by zero', () => {
    expect(senditSplit([])).toEqual({ sendit: 0, standard: 0, total: 0, share: 0 })
  })
})

describe('countSessionCodes', () => {
  it('counts codes belonging to one session', () => {
    expect(countSessionCodes(codes, 's1')).toBe(2)
    expect(countSessionCodes(codes, 's2')).toBe(1)
    expect(countSessionCodes(codes, 'missing')).toBe(0)
  })
})

describe('dayKey fixtures', () => {
  it('produces local YYYY-MM-DD keys', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(dayKey('2026-12-31T12:00:00')).toBe('2026-12-31')
  })
})
