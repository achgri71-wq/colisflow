import { describe, expect, it } from 'vitest'
import type { Distributor, ScanCode } from '../types'
import { multiSearchCodes, parseMultiCodes } from './multiSearch'

const NOW = '2026-11-14T10:00:00.000Z'

function distributor(id: string, name: string, archived = false): Distributor {
  return {
    id,
    name,
    createdAt: NOW,
    updatedAt: NOW,
    archived,
  }
}

function code(id: string, value: string, distributorId: string, scannedAt = NOW): ScanCode {
  return {
    id,
    code: value,
    sessionId: 'sess_1',
    distributorId,
    scannedAt,
    source: 'camera',
  }
}

const data = {
  distributors: [distributor('d1', 'Yassine'), distributor('d2', 'Omar', true)],
  codes: [
    code('c1', 'DH123456789', 'd1'),
    code('c2', 'SF998877', 'd1'),
    code('c3', 'DH123456789', 'd2'),
  ],
}

describe('parseMultiCodes', () => {
  it('splits on lines and separators, trims and uppercases', () => {
    expect(parseMultiCodes('dh123456789\nsf998877, ma111; dh123456789\t  \n  ')).toEqual([
      'DH123456789',
      'SF998877',
      'MA111',
    ])
  })

  it('extracts codes from sendit share links', () => {
    expect(parseMultiCodes('https://app.sendit.ma/deliveries/DH123456789')).toEqual(['DH123456789'])
  })
})

describe('multiSearchCodes', () => {
  it('matches exactly and lists every distributor holding the code', () => {
    const result = multiSearchCodes(['DH123456789'], data)
    expect(result.total).toBe(1)
    expect(result.found).toBe(1)
    expect(result.missing).toBe(0)
    expect(result.items[0]?.matches.map((match) => match.distributorName).sort()).toEqual([
      'Omar',
      'Yassine',
    ])
    expect(result.items[0]?.matches[0]?.archived).toBe(false)
  })

  it('reports missing codes and keeps input order', () => {
    const result = multiSearchCodes(['DH123456789', 'NOPE000', 'SF998877'], data)
    expect(result.items.map((item) => item.code)).toEqual(['DH123456789', 'NOPE000', 'SF998877'])
    expect(result.items[1]?.matches).toEqual([])
    expect(result.found).toBe(2)
    expect(result.missing).toBe(1)
  })

  it('is case-insensitive and de-duplicated', () => {
    const result = multiSearchCodes(['dh123456789', 'DH123456789', ' '], data)
    expect(result.total).toBe(1)
    expect(result.found).toBe(1)
  })

  it('sorts matches by most recent scan first', () => {
    const withHistory = {
      distributors: data.distributors,
      codes: [
        code('c1', 'DH123456789', 'd1', '2026-11-14T10:00:00.000Z'),
        code('c3', 'DH123456789', 'd2', '2026-11-10T10:00:00.000Z'),
      ],
    }
    const result = multiSearchCodes(['DH123456789'], withHistory)
    expect(result.items[0]?.matches[0]?.distributorId).toBe('d1')
  })
})
