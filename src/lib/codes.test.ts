import { describe, expect, it } from 'vitest'
import {
  codeKind,
  codeTypeLabel,
  extractCode,
  groupCodesForExport,
  isLikelyCode,
  isSendit,
  parseCodeBlob,
  senditPrefixesFromInput,
  uniqueCodes,
} from './codes'

describe('extractCode', () => {
  it('returns plain codes untouched', () => {
    expect(extractCode('DH123456789')).toBe('DH123456789')
    expect(extractCode('  colis-42  ')).toBe('colis-42')
  })

  it('extracts the tracking code from a Sendit share URL', () => {
    expect(extractCode('https://app.sendit.ma/deliveries/DH123456789')).toBe('DH123456789')
    expect(extractCode('app.sendit.ma/deliveries/DXH987654321?lang=fr')).toBe('DXH987654321')
  })

  it('decodes percent-encoded path segments', () => {
    expect(extractCode('https://example.com/track/ABC%20123')).toBe('ABC 123')
  })

  it('strips zero-width characters and handles empty input', () => {
    expect(extractCode('\uFEFFDH123\u200B')).toBe('DH123')
    expect(extractCode('')).toBe('')
    expect(extractCode('   ')).toBe('')
    expect(extractCode(undefined as unknown as string)).toBe('')
  })
})

describe('Sendit detection', () => {
  it('matches default prefixes case-insensitively', () => {
    expect(isSendit('DH123456')).toBe(true)
    expect(isSendit('dxh123456')).toBe(true)
    expect(isSendit('DSH42')).toBe(true)
    expect(isSendit('XYZ42')).toBe(false)
  })

  it('honours custom prefixes', () => {
    expect(isSendit('MA9900', ['MA'])).toBe(true)
    expect(isSendit('DH9900', ['MA'])).toBe(false)
    expect(isSendit('', ['MA'])).toBe(false)
    expect(isSendit('MA9900', [])).toBe(false)
  })

  it('classifies codes and labels them', () => {
    expect(codeKind('DH001')).toBe('sendit')
    expect(codeKind('OTHER')).toBe('standard')
    expect(codeTypeLabel('sendit', 'fr')).toBe('Sendit')
    expect(codeTypeLabel('standard', 'en')).toBe('Standard')
    expect(codeTypeLabel('standard', 'ar')).toBe('عادي')
  })
})

describe('parseCodeBlob', () => {
  it('splits on newlines, commas, semicolons and tabs', () => {
    expect(parseCodeBlob('DH1\nDH2, DH3;DH4\tDH5')).toEqual(['DH1', 'DH2', 'DH3', 'DH4', 'DH5'])
  })

  it('extracts URL codes and drops blank entries', () => {
    expect(
      parseCodeBlob('\nhttps://app.sendit.ma/deliveries/DH123\n\n  \nCODE-2\n'),
    ).toEqual(['DH123', 'CODE-2'])
  })
})

describe('uniqueCodes', () => {
  it('keeps first occurrence order', () => {
    expect(uniqueCodes(['A', 'B', 'A', 'C', 'B'])).toEqual(['A', 'B', 'C'])
  })

  it('skips empty values', () => {
    expect(uniqueCodes(['', 'A', ''])).toEqual(['A'])
  })
})

describe('groupCodesForExport', () => {
  it('separates Sendit and standard codes', () => {
    expect(groupCodesForExport(['DH1', 'ABC', 'DSH2', 'ZZZ'])).toEqual({
      sendit: ['DH1', 'DSH2'],
      standard: ['ABC', 'ZZZ'],
    })
  })
})

describe('isLikelyCode', () => {
  it('accepts plausible tracking identifiers', () => {
    expect(isLikelyCode('DH123456789')).toBe(true)
    expect(isLikelyCode('123456')).toBe(true)
    expect(isLikelyCode('كود-123')).toBe(true)
  })

  it('rejects headings, short values and unsupported types', () => {
    expect(isLikelyCode('Code')).toBe(false)
    expect(isLikelyCode('Total')).toBe(false)
    expect(isLikelyCode('Sendit')).toBe(false)
    expect(isLikelyCode('ab')).toBe(false)
    expect(isLikelyCode(null)).toBe(false)
    expect(isLikelyCode({})).toBe(false)
  })
})

describe('senditPrefixesFromInput', () => {
  it('normalizes, deduplicates and trims prefixes', () => {
    expect(senditPrefixesFromInput(' dh, DXH; dsh dh  ma ')).toEqual([
      'DH',
      'DXH',
      'DSH',
      'MA',
    ])
  })

  it('returns an empty array for blank input', () => {
    expect(senditPrefixesFromInput('   ')).toEqual([])
  })
})
