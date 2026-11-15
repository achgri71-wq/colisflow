import { describe, expect, it } from 'vitest'
import { FIXED_LISTS, isFixedListName, normalizeFixedName } from './fixedLists'

describe('normalizeFixedName', () => {
  it('collapses spacing, accents and the ROUTEUR(E) spelling', () => {
    expect(normalizeFixedName('ROUTEURE AYOUB')).toBe('routeur ayoub')
    expect(normalizeFixedName('ROUTEUR  AYOUB')).toBe('routeur ayoub')
    expect(normalizeFixedName('ROUTEURÉ AYOUB')).toBe('routeur ayoub')
  })
})

describe('isFixedListName', () => {
  it('accepts the six built-in names as written', () => {
    for (const list of FIXED_LISTS) expect(isFixedListName(list.name)).toBe(true)
  })

  it('still matches a respelled routeur list coming from Colis Scanner', () => {
    expect(isFixedListName('ROUTEURE ANASS')).toBe(true)
    expect(isFixedListName('ROUTEURE   AYOUB')).toBe(true)
  })

  it('never matches a normal distributor', () => {
    expect(isFixedListName('LIVREUR TEST')).toBe(false)
  })
})
