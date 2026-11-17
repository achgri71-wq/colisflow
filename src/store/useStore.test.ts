import { beforeEach, describe, expect, it, vi } from 'vitest'

// The store persists through IndexedDB; mock the whole data layer.
vi.mock('../lib/db')

import { useStore } from './useStore'
import type { Distributor, ScanCode } from '../types'

const NOW = new Date().toISOString()

function distributor(id: string, name: string, fixed = false): Distributor {
  return { id, name, createdAt: NOW, updatedAt: NOW, archived: false, ...(fixed ? { fixed: true } : {}) }
}

function code(id: string, value: string, distributorId: string): ScanCode {
  return {
    id,
    code: value,
    raw: value,
    sessionId: 'sess-1',
    distributorId,
    scannedAt: NOW,
    source: 'manual',
  }
}

describe('importFromScanner — permanent routeur lists', () => {
  beforeEach(() => {
    useStore.setState({ distributors: [], sessions: [], codes: [], events: [] })
  })

  it('never pulls a code out of a fixed list, even when the scanner lists it elsewhere', async () => {
    const fixed = distributor('fixed-routeure-ayoub', 'ROUTEURE AYOUB', true)
    const other = distributor('dist-1', 'LIVREUR A')
    useStore.setState({
      distributors: [fixed, other],
      codes: [code('code-1', 'SENDIT001', fixed.id)],
      sessions: [],
    })

    await useStore.getState().importFromScanner([
      { id: 'sd-1', name: 'LIVREUR A', codes: ['SENDIT001'], archived: false },
    ])

    const stored = useStore.getState().codes.find((entry) => entry.code === 'SENDIT001')
    expect(stored?.distributorId).toBe(fixed.id)
  })

  it('imports a differently spelled routeur name into its canonical fixed list', async () => {
    const fixed = distributor('fixed-routeur-anass', 'ROUTEUR ANASS', true)
    useStore.setState({ distributors: [fixed], codes: [], sessions: [] })

    await useStore.getState().importFromScanner([
      { id: 'sd-routeur', name: 'ROUTEURE ANASS', codes: ['SENDIT010'], archived: false },
    ])

    const state = useStore.getState()
    expect(state.distributors).toHaveLength(1)
    expect(state.codes.find((entry) => entry.code === 'SENDIT010')?.distributorId).toBe(fixed.id)
  })

  it('keeps the fixed-list copy when the same code is listed twice in one batch', async () => {
    const fixed = distributor('fixed-routeur-anass', 'ROUTEUR ANASS', true)
    const other = distributor('dist-2', 'LIVREUR B')
    useStore.setState({
      distributors: [fixed, other],
      codes: [code('code-2', 'SENDIT002', fixed.id)],
      sessions: [],
    })

    await useStore.getState().importFromScanner([
      { id: 'sd-2', name: 'LIVREUR B', codes: ['SENDIT002'], archived: false },
      { id: 'sd-3', name: 'ROUTEUR ANASS', codes: ['SENDIT002'], archived: false },
    ])

    const stored = useStore.getState().codes.find((entry) => entry.code === 'SENDIT002')
    expect(stored?.distributorId).toBe(fixed.id)
  })

  it('still moves a code between ordinary distributors', async () => {
    const a = distributor('dist-a', 'LIVREUR A')
    const b = distributor('dist-b', 'LIVREUR B')
    useStore.setState({
      distributors: [a, b],
      codes: [code('code-3', 'SENDIT003', a.id)],
      sessions: [],
    })

    await useStore.getState().importFromScanner([
      { id: 'sd-4', name: 'LIVREUR B', codes: ['SENDIT003'], archived: false },
    ])

    const stored = useStore.getState().codes.find((entry) => entry.code === 'SENDIT003')
    expect(stored?.distributorId).toBe(b.id)
  })

  it('keeps the original scan date when a code moves between distributors', async () => {
    const a = distributor('dist-a', 'LIVREUR A')
    const b = distributor('dist-b', 'LIVREUR B')
    const original = '2026-11-01T08:00:00.000Z'
    useStore.setState({
      distributors: [a, b],
      codes: [{ ...code('code-4', 'SENDIT004', a.id), scannedAt: original }],
      sessions: [],
    })

    await useStore.getState().importFromScanner([
      {
        id: 'sd-5',
        name: 'LIVREUR B',
        codes: ['SENDIT004'],
        archived: false,
        date: '2026-11-13T09:00:00.000Z',
      },
    ])

    const stored = useStore.getState().codes.find((entry) => entry.code === 'SENDIT004')
    expect(stored?.distributorId).toBe(b.id)
    expect(stored?.scannedAt).toBe(original)
    // The late count restarts from the day the code landed in the new list.
    expect(stored?.movedFrom?.movedAt).toBe('2026-11-13T09:00:00.000Z')
  })
})

describe('importFromScanner — archived lists stay archived', () => {
  beforeEach(() => {
    useStore.setState({ distributors: [], sessions: [], codes: [], events: [] })
  })

  it('creates a list archived on the Colis Scanner side as active', async () => {
    const result = await useStore.getState().importFromScanner([
      {
        id: 'sd-arch',
        name: 'ANCIEN CLIENT',
        codes: ['SENDIT100'],
        archived: true,
        date: '2026-11-01T00:00:00.000Z',
      },
    ])

    const created = useStore.getState().distributors.find((entry) => entry.name === 'ANCIEN CLIENT')
    expect(created?.archived).toBe(false)
    expect(created?.archivedAt).toBeUndefined()
    expect(result.names).toContain('ANCIEN CLIENT')
  })

  it('keeps a list archived in ColisFlow archived and ignores its codes', async () => {
    const archived: Distributor = {
      id: 'dist-old',
      name: 'ANCIEN',
      createdAt: NOW,
      updatedAt: NOW,
      archived: true,
      archivedAt: NOW,
    }
    useStore.setState({ distributors: [archived], codes: [], sessions: [] })

    const result = await useStore.getState().importFromScanner([
      { id: 'sd-old', name: 'ANCIEN', codes: ['SENDIT200'], archived: true },
    ])

    const stored = useStore.getState().distributors.find((entry) => entry.id === 'dist-old')
    expect(stored?.archived).toBe(true)
    expect(stored?.archivedAt).toBe(NOW)
    expect(useStore.getState().codes).toHaveLength(0)
    expect(result.added).toBe(0)
    expect(result.names).toEqual([])
  })

  it('prefers an active list over an archived one that shares its name', async () => {
    const archived: Distributor = {
      id: 'dist-arch',
      name: 'MEME NOM',
      createdAt: NOW,
      updatedAt: NOW,
      archived: true,
      archivedAt: NOW,
    }
    const active = distributor('dist-active', 'MEME NOM')
    useStore.setState({ distributors: [archived, active], codes: [], sessions: [] })

    await useStore.getState().importFromScanner([
      { id: 'sd-same', name: 'MEME NOM', codes: ['SENDIT210'], archived: false },
    ])

    const stored = useStore.getState().codes.find((entry) => entry.code === 'SENDIT210')
    expect(stored?.distributorId).toBe(active.id)
    expect(
      useStore.getState().distributors.find((entry) => entry.id === 'dist-arch')?.archived,
    ).toBe(true)
  })

  it('reports only the lists that actually received new codes', async () => {
    const result = await useStore.getState().importFromScanner([
      { id: 'sd-a', name: 'LIVREUR A', codes: ['SENDIT300'], archived: false },
      { id: 'sd-b', name: 'LIVREUR B', codes: [], archived: false },
    ])

    expect(result.names).toEqual(['LIVREUR A'])
  })
})

describe('importFromScanner — manual touch', () => {
  const OLD = '2020-01-01T00:00:00.000Z'

  beforeEach(() => {
    useStore.setState({ distributors: [], sessions: [], codes: [], events: [] })
  })

  it('brings a manually imported list to the top even when nothing is new', async () => {
    const list = distributor('dist-a', 'LIVREUR A')
    list.updatedAt = OLD
    useStore.setState({
      distributors: [list],
      codes: [code('code-1', 'SENDIT1', list.id)],
      sessions: [],
    })

    const result = await useStore
      .getState()
      .importFromScanner(
        [{ id: 'sd-a', name: 'LIVREUR A', codes: ['SENDIT1'], archived: false }],
        { touch: true },
      )

    expect(result.added).toBe(0)
    const stored = useStore.getState().distributors.find((entry) => entry.id === 'dist-a')
    expect(stored?.updatedAt).not.toBe(OLD)
    expect(stored?.updatedAt.localeCompare(OLD)).toBeGreaterThan(0)
  })

  it('leaves the timestamp alone during an automatic import', async () => {
    const list = distributor('dist-a', 'LIVREUR A')
    list.updatedAt = OLD
    useStore.setState({
      distributors: [list],
      codes: [code('code-1', 'SENDIT1', list.id)],
      sessions: [],
    })

    await useStore
      .getState()
      .importFromScanner([{ id: 'sd-a', name: 'LIVREUR A', codes: ['SENDIT1'], archived: false }])

    const stored = useStore.getState().distributors.find((entry) => entry.id === 'dist-a')
    expect(stored?.updatedAt).toBe(OLD)
  })

  it('never brings an archived list forward', async () => {
    const archived: Distributor = {
      id: 'dist-arch',
      name: 'ANCIEN',
      createdAt: NOW,
      updatedAt: OLD,
      archived: true,
      archivedAt: NOW,
    }
    useStore.setState({ distributors: [archived], codes: [], sessions: [] })

    await useStore
      .getState()
      .importFromScanner([{ id: 'sd-arch', name: 'ANCIEN', codes: ['SENDIT9'], archived: true }], {
        touch: true,
      })

    const stored = useStore.getState().distributors.find((entry) => entry.id === 'dist-arch')
    expect(stored?.updatedAt).toBe(OLD)
    expect(stored?.archived).toBe(true)
  })
})
