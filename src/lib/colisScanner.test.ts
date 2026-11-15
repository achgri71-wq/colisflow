import { describe, expect, it } from 'vitest'
import { buildFlowPayload, normalizeScanDistributors } from './colisScanner'

describe('normalizeScanDistributors', () => {
  it('reads the Realtime Database map form', () => {
    const list = normalizeScanDistributors({
      a1: {
        id: 'a1',
        name: 'Yassine',
        codes: ['DH123', 'https://app.sendit.ma/deliveries/DH456'],
        date: '2026-11-12T10:00:00.000Z',
        archived: false,
      },
      b2: { id: 'b2', name: 'Omar', codes: { x: 'SF99', y: 'SF99' }, date: '2026-11-10T08:00:00.000Z' },
    })
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ id: 'a1', name: 'Yassine', codes: ['DH123', 'DH456'], archived: false })
    expect(list[1]).toMatchObject({ id: 'b2', name: 'Omar', codes: ['SF99'] })
  })

  it('sorts active distributors first, newest date first', () => {
    const list = normalizeScanDistributors({
      old: { name: 'Ancien', codes: [], date: '2026-01-01T00:00:00.000Z' },
      newer: { name: 'Nouveau', codes: [], date: '2026-11-12T00:00:00.000Z' },
      archived: { name: 'Archive', codes: [], date: '2026-11-13T00:00:00.000Z', archived: true },
    })
    expect(list.map((item) => item.name)).toEqual(['Nouveau', 'Ancien', 'Archive'])
  })

  it('treats deletedAt as archived', () => {
    const list = normalizeScanDistributors({
      x: { name: 'Casablanca', codes: ['DH1'], deletedAt: '2026-11-05T00:00:00.000Z' },
    })
    expect(list[0]?.archived).toBe(true)
  })

  it('skips empty names and normalises code blobs', () => {
    const list = normalizeScanDistributors({
      bad: { name: '   ', codes: ['DH1'] },
      multi: { name: 'Multi', codes: 'DH1\nDH2\nSF3' },
      junk: 'not-an-object',
      nullish: null,
    })
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('Multi')
  })

  it('returns an empty list for null payloads', () => {
    expect(normalizeScanDistributors(null)).toEqual([])
    expect(normalizeScanDistributors(undefined)).toEqual([])
    expect(normalizeScanDistributors(42)).toEqual([])
  })
})

describe('buildFlowPayload', () => {
  it('publishes the distributor phone and keeps dates aligned with codes', () => {
    const payload = buildFlowPayload(
      [{ id: 'd1', name: 'Rachid', phone: '0612345678', updatedAt: '2026-11-14T00:00:00.000Z', archived: false }],
      [
        { code: 'A1', distributorId: 'd1', scannedAt: '2026-11-10T08:00:00.000Z' },
        { code: 'A2', distributorId: 'd1', scannedAt: '2026-11-11T08:00:00.000Z' },
      ],
    )
    expect(payload.distributors[0]).toMatchObject({
      name: 'Rachid',
      phone: '0612345678',
      codes: ['A1', 'A2'],
      dates: ['2026-11-10T08:00:00.000Z', '2026-11-11T08:00:00.000Z'],
    })
  })

  it('counts a swapped code from its move date', () => {
    const payload = buildFlowPayload(
      [{ id: 'd1', name: 'Rachid', updatedAt: '2026-11-14T00:00:00.000Z', archived: false }],
      [
        {
          code: 'A1',
          distributorId: 'd1',
          scannedAt: '2026-11-01T08:00:00.000Z',
          movedFrom: { movedAt: '2026-11-13T09:00:00.000Z' },
        },
      ],
    )
    expect(payload.distributors[0].dates).toEqual(['2026-11-13T09:00:00.000Z'])
  })

  it('omits the phone when the distributor has none', () => {
    const payload = buildFlowPayload(
      [{ id: 'd1', name: 'Rachid', updatedAt: '2026-11-14T00:00:00.000Z', archived: false }],
      [],
    )
    expect(payload.distributors[0]).not.toHaveProperty('phone')
  })
})
