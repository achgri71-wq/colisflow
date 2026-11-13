import { describe, expect, it } from 'vitest'
import { matchLivreur, normalizeName, sudErrorKey, type SudLivreur } from './sud'

const livreurs: SudLivreur[] = [
  { id: '11', name: 'Karim Chraibi' },
  { id: '12', name: 'Youssef Amrani' },
  { id: '13', name: 'Mohamed Alami' },
  { id: '14', name: 'سعيد بناني' },
]

describe('normalizeName', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeName('  Karim   CHRAÏBI ')).toBe('karim chraibi')
    expect(normalizeName('Youssef-Amrâni')).toBe('youssef amrani')
  })

  it('keeps Arabic letters', () => {
    expect(normalizeName('سعيد بناني')).toBe('سعيد بناني')
  })
})

describe('matchLivreur', () => {
  it('matches on an exact name', () => {
    expect(matchLivreur('youssef amrani', livreurs)?.id).toBe('12')
    expect(matchLivreur('YOUSSEF AMRANI', livreurs)?.id).toBe('12')
  })

  it('matches a single-token distributor name', () => {
    expect(matchLivreur('Karim', livreurs)?.id).toBe('11')
  })

  it('matches when the full name contains the distributor name', () => {
    expect(matchLivreur('Mohamed Alami', livreurs)?.id).toBe('13')
  })

  it('matches Arabic names', () => {
    expect(matchLivreur('سعيد بناني', livreurs)?.id).toBe('14')
  })

  it('returns null when nothing matches', () => {
    expect(matchLivreur('Personne Inconnue', livreurs)).toBeNull()
    expect(matchLivreur('', livreurs)).toBeNull()
    expect(matchLivreur('Karim', [])).toBeNull()
  })
})

describe('sudErrorKey', () => {
  it('maps known bridge errors to translation keys', () => {
    expect(sudErrorKey(new Error('unauthorized'))).toBe('sud.errAuth')
    expect(sudErrorKey(new Error('livreur-not-found'))).toBe('sud.errLivreur')
    expect(sudErrorKey(new Error('too-many-codes'))).toBe('sud.errTooMany')
  })

  it('falls back to a network error for unknown failures', () => {
    expect(sudErrorKey(new Error('Failed to fetch'))).toBe('sud.errNetwork')
    expect(sudErrorKey('boom')).toBe('sud.errNetwork')
  })
})
