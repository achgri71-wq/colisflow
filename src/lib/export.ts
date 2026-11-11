import type { Cell, SheetData } from 'write-excel-file/browser'
import type { Distributor, Language, ScanCode, ScanSession } from '../types'
import { groupCodesForExport, isLikelyCode } from './codes'
import { dayKey, formatDate, formatTime, sanitizeFilename } from './utils'

interface ExportContext {
  lang: Language
  prefixes: string[]
}

const SOURCE_LABELS: Record<Language, Record<string, string>> = {
  fr: { camera: 'Caméra', manual: 'Manuel', hid: 'Douchette', import: 'Import' },
  en: { camera: 'Camera', manual: 'Manual', hid: 'Scanner', import: 'Import' },
  ar: { camera: 'كاميرا', manual: 'يدوي', hid: 'ماسح', import: 'استيراد' },
}

const HEADERS: Record<Language, string[]> = {
  fr: ['Code', 'Type', 'Date', 'Session', 'Source'],
  en: ['Code', 'Type', 'Date', 'Session', 'Source'],
  ar: ['الرمز', 'النوع', 'التاريخ', 'الجلسة', 'المصدر'],
}

function headerCell(value: string): Cell {
  return {
    value,
    fontWeight: 'bold',
    backgroundColor: '#0e1b33',
    textColor: '#8db8ff',
    height: 22,
  }
}

function detailsSheet(
  codes: ScanCode[],
  sessions: ScanSession[],
  ctx: ExportContext,
): SheetData {
  const lang = ctx.lang
  const sessionById = new Map(sessions.map((session) => [session.id, session]))
  const rows: SheetData = [HEADERS[lang].map(headerCell)]

  const sorted = [...codes].sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))
  for (const code of sorted) {
    const session = sessionById.get(code.sessionId)
    const sessionLabel = session
      ? `${formatDate(session.startedAt, lang)} ${formatTime(session.startedAt, lang)}`
      : '—'
    rows.push([
      code.code,
      groupCodesForExport([code.code], ctx.prefixes).sendit.length ? 'Sendit' : 'Standard',
      `${formatDate(code.scannedAt, lang)} ${formatTime(code.scannedAt, lang)}`,
      sessionLabel,
      SOURCE_LABELS[lang][code.source] ?? code.source,
    ])
  }

  return rows
}

export async function exportDistributorExcel(
  distributor: Distributor,
  codes: ScanCode[],
  sessions: ScanSession[],
  ctx: ExportContext,
): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const grouped = groupCodesForExport(
    codes.map((code) => code.code),
    ctx.prefixes,
  )

  const codeRows: SheetData = []
  grouped.sendit.forEach((code) => codeRows.push([code]))
  if (grouped.sendit.length && grouped.standard.length) codeRows.push([])
  grouped.standard.forEach((code) => codeRows.push([code]))
  if (!codeRows.length) codeRows.push([''])

  const fileName = `${sanitizeFilename(distributor.name)}-${dayKey(new Date())}.xlsx`

  await writeXlsxFile(
    [
      {
        data: codeRows,
        sheet: 'Codes',
        columns: [{ width: 28 }],
      },
      {
        data: detailsSheet(codes, sessions, ctx),
        sheet: ctx.lang === 'ar' ? 'التفاصيل' : 'Détails',
        columns: [{ width: 24 }, { width: 12 }, { width: 20 }, { width: 20 }, { width: 14 }],
        rightToLeft: ctx.lang === 'ar',
      },
    ],
    { fontFamily: 'Calibri', fontSize: 11 },
  ).toFile(fileName)
}

export function exportCodesCsv(codes: ScanCode[], filename: string): void {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  const lines = [
    ['code', 'type', 'scanned_at', 'session_id', 'distributor_id'].join(','),
    ...codes.map((code) =>
      [
        escape(code.code),
        escape(code.code.toUpperCase().startsWith('DH') ? 'sendit' : 'standard'),
        escape(code.scannedAt),
        escape(code.sessionId),
        escape(code.distributorId),
      ].join(','),
    ),
  ]
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${sanitizeFilename(filename)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]
    const next = clean[i + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

export interface SpreadsheetImport {
  codes: string[]
  column: number
  rows: number
}

const HEADER_PATTERN =
  /^(?:code(?:\s*[-_ ]?\s*barre)?|barcode|tracking(?:\s*(?:number|no|code))?|suivi|num[ée]ro|n[°o]|colis|parcel|parcels|reference|r[ée]f[ée]rence|exp[ée]dition|shipment|waybill|awb|رمز|تتبع|رقم|طرد)$/i

/** Columns whose header clearly describes metadata rather than tracking codes. */
const NON_CODE_HEADER_PATTERN =
  /^(?:phone|t[ée]l[ée]phone|tel|mobile|contact|supplier|fournisseur|fourn\.?|status|statut|[ée]tat|state|date|heure|time|name|nom|client|customer|destinataire|recipient|adresse|address|ville|city|note|notes|remarque|commentaire|comment|quantit[ée]|quantity|qty|poids|weight|prix|price|montant|total|email|e-?mail|courriel|هاتف|مورد|حالة|تاريخ|اسم|عميل|عنوان|ملاحظة|كمية|وزن|سعر|بريد)$/i

function looksLikeHeader(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return HEADER_PATTERN.test(value.trim())
}

function looksLikeMetadataHeader(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return NON_CODE_HEADER_PATTERN.test(value.trim())
}

/** Scores a candidate value as a tracking code. Higher is more convincing. */
function valueWeight(value: string): number {
  let weight = 1
  if (/\d/.test(value)) weight += 2
  if (value.length >= 6) weight += 1
  if (!/\s/.test(value)) weight += 1
  if (/^[A-Z0-9._/-]+$/i.test(value)) weight += 1
  return weight
}

/**
 * Picks the column that most looks like tracking codes.
 * Uses distinct values so a repeated status/supplier column cannot win,
 * and gives a strong bonus to an explicit header such as "Code" or "Suivi".
 */
function detectCodeColumn(rows: unknown[][]): number {
  const maxColumns = Math.min(
    12,
    rows.reduce((max, row) => Math.max(max, row.length), 0),
  )

  let bestColumn = 0
  let bestScore = 0

  for (let column = 0; column < maxColumns; column += 1) {
    const values = rows
      .map((row) => row[column])
      .filter((value): value is string | number => isLikelyCode(value))
      .map((value) => String(value).trim())

    if (!values.length) continue

    const distinct = new Map<string, string>()
    for (const value of values) {
      const key = value.toLowerCase()
      if (!distinct.has(key)) distinct.set(key, value)
    }

    let score = 0
    for (const value of distinct.values()) score += valueWeight(value)

    // A wider set of distinct values is more likely to be a real code column.
    score += Math.min(4, distinct.size * 0.35)

    if (looksLikeHeader(rows[0]?.[column])) score += 20
    else if (looksLikeMetadataHeader(rows[0]?.[column])) score -= 100

    if (score > bestScore) {
      bestScore = score
      bestColumn = column
    }
  }

  return bestColumn
}

export async function readCodesFromSpreadsheet(file: File): Promise<SpreadsheetImport> {
  let rows: unknown[][]
  const isCsv = /\.csv$/i.test(file.name) || file.type.includes('csv')

  if (isCsv) {
    rows = parseCsv(await file.text())
  } else {
    const { readSheet } = await import('read-excel-file/browser')
    rows = await readSheet(file)
  }

  if (!rows.length) return { codes: [], column: 0, rows: 0 }

  const bestColumn = detectCodeColumn(rows)
  const hasHeader = looksLikeHeader(rows[0]?.[bestColumn])

  const codes: string[] = []
  const seen = new Set<string>()

  for (let index = 0; index < rows.length; index += 1) {
    if (index === 0 && hasHeader) continue
    const value = rows[index]?.[bestColumn]
    if (!isLikelyCode(value) || looksLikeHeader(value)) continue
    const code = String(value).trim()
    if (seen.has(code)) continue
    seen.add(code)
    codes.push(code)
  }

  return { codes, column: bestColumn, rows: rows.length }
}
