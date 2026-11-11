import { describe, expect, it } from 'vitest'
import { readCodesFromSpreadsheet } from './export'

function csvFile(content: string, name = 'codes.csv'): File {
  return new File([content], name, { type: 'text/csv' })
}

describe('readCodesFromSpreadsheet', () => {
  it('prefers the code column over a supplier column with repeated values', async () => {
    const result = await readCodesFromSpreadsheet(
      csvFile(
        'Code;Fournisseur\nZZZ100;Test\nZZZ200;Test\nDH123456789;Doublon\n',
      ),
    )
    expect(result.column).toBe(0)
    expect(result.codes).toEqual(['ZZZ100', 'ZZZ200', 'DH123456789'])
    expect(result.rows).toBe(4)
  })

  it('skips a recognised header row', async () => {
    const result = await readCodesFromSpreadsheet(
      csvFile('Suivi,Transporteur\nDH111111,Maersk\nABC222,Chronopost\n'),
    )
    expect(result.codes).toEqual(['DH111111', 'ABC222'])
    expect(result.column).toBe(0)
  })

  it('ignores phone and supplier columns even when they contain many unique values', async () => {
    const result = await readCodesFromSpreadsheet(
      csvFile(
        [
          'Téléphone;Fournisseur;Code',
          '0612345678;Alpha;DH111111',
          '0623456789;Beta;DH222222',
          '0634567890;Gamma;DH333333',
          '0645678901;Delta;DH444444',
          '0656789012;Epsilon;DH555555',
        ].join('\n'),
      ),
    )
    expect(result.column).toBe(2)
    expect(result.codes).toEqual([
      'DH111111',
      'DH222222',
      'DH333333',
      'DH444444',
      'DH555555',
    ])
  })

  it('handles headerless files', async () => {
    const result = await readCodesFromSpreadsheet(
      csvFile('ZZZ100,Auto\nZZZ200,Auto\nZZZ300,Auto\n'),
    )
    expect(result.codes).toEqual(['ZZZ100', 'ZZZ200', 'ZZZ300'])
    expect(result.column).toBe(0)
  })

  it('removes duplicate codes while keeping the first occurrence order', async () => {
    const result = await readCodesFromSpreadsheet(
      csvFile('Code\nDH123\nABC456\nDH123\nABC456\n'),
    )
    expect(result.codes).toEqual(['DH123', 'ABC456'])
  })

  it('parses comma-delimited CSV with quoted values', async () => {
    const result = await readCodesFromSpreadsheet(
      csvFile('Code,Note\n"DH 123",première ligne\n"ABC,456",deuxième\n'),
    )
    expect(result.codes).toEqual(['DH 123', 'ABC,456'])
  })

  it('parses semicolon-delimited CSV', async () => {
    const result = await readCodesFromSpreadsheet(
      csvFile('Code;Fournisseur\nDH123;Alpha\nABC456;Beta\n'),
    )
    expect(result.codes).toEqual(['DH123', 'ABC456'])
  })

  it('returns an empty result for empty input', async () => {
    expect(await readCodesFromSpreadsheet(csvFile(''))).toEqual({
      codes: [],
      column: 0,
      rows: 0,
    })
  })

  it('ignores a header-only file', async () => {
    const result = await readCodesFromSpreadsheet(csvFile('Code\n'))
    expect(result.codes).toEqual([])
    expect(result.rows).toBe(1)
  })

  it('strips a byte-order mark from the first cell', async () => {
    const result = await readCodesFromSpreadsheet(csvFile('\uFEFFCode\nDH999\n'))
    expect(result.codes).toEqual(['DH999'])
  })
})
