import type { Distributor, ScanCode } from '../types'
import { extractCode } from './codes'

/**
 * Multi-code lookup for the search page: paste (or scan) many codes at once
 * and get, for each one, the distributor(s) it currently belongs to.
 */

export interface CodeMatch {
  code: string
  distributorId: string
  distributorName: string
  archived: boolean
  scannedAt: string
}

export interface MultiSearchItem {
  /** Normalised code that was searched. */
  code: string
  matches: CodeMatch[]
}

export interface MultiSearchResponse {
  items: MultiSearchItem[]
  total: number
  found: number
  missing: number
}

/** Splits pasted text into canonical, de-duplicated codes (order preserved). */
export function parseMultiCodes(text: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of String(text ?? '').split(/[\n\r,;\t]+/)) {
    const code = extractCode(raw).toUpperCase()
    if (!code || seen.has(code)) continue
    seen.add(code)
    result.push(code)
  }
  return result
}

/** Looks up every code across all distributors with an exact (case-insensitive) match. */
export function multiSearchCodes(
  codes: string[],
  data: { codes: ScanCode[]; distributors: Distributor[] },
): MultiSearchResponse {
  const namesById = new Map(
    data.distributors.map((distributor) => [distributor.id, distributor]),
  )
  const byCode = new Map<string, ScanCode[]>()
  for (const record of data.codes) {
    const key = record.code.toUpperCase()
    const list = byCode.get(key)
    if (list) list.push(record)
    else byCode.set(key, [record])
  }

  const seen = new Set<string>()
  const items: MultiSearchItem[] = []
  let found = 0

  for (const raw of codes) {
    const code = extractCode(raw).toUpperCase()
    if (!code || seen.has(code)) continue
    seen.add(code)

    const records = (byCode.get(code) ?? [])
      .slice()
      .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
    const matches: CodeMatch[] = []
    const seenDistributors = new Set<string>()
    for (const record of records) {
      if (seenDistributors.has(record.distributorId)) continue
      seenDistributors.add(record.distributorId)
      const distributor = namesById.get(record.distributorId)
      matches.push({
        code: record.code,
        distributorId: record.distributorId,
        distributorName: distributor?.name ?? '',
        archived: Boolean(distributor?.archived),
        scannedAt: record.scannedAt,
      })
    }

    if (matches.length) found += 1
    items.push({ code, matches })
  }

  return { items, total: items.length, found, missing: items.length - found }
}
