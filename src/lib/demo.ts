import type { ActivityEvent, Distributor, ScanCode, ScanSession } from '../types'
import type { AllData } from './db'
import { addDays, uid } from './utils'

const NAMES = [
  'Yassine Bennani',
  'Salma El Idrissi',
  'Omar Tazi',
  'Hind Aït Ali',
  'Karim Chraibi',
  'Nada Berrada',
  'Mehdi Alaoui',
  'Sofia Lahlou',
]

const ARCHIVED_NAMES = ['Retour Sendit', 'Ancien secteur — Casablanca']

const NOTES = [
  'Secteur Maârif — livraison matin',
  'Zone Hay Hassani',
  'Centre-ville, après 14h',
  'Secteur Sidi Maârouf',
  'Livraisons prioritaires',
  'Secteur Ain Diab',
]

function mulberry32(seed: number): () => number {
  let value = seed
  return () => {
    value |= 0
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min
}

function pick<T>(random: () => number, items: T[]): T {
  return items[Math.floor(random() * items.length)] as T
}

function senditCode(random: () => number): string {
  const prefix = pick(random, ['DH', 'DXH', 'DSH'])
  const length = prefix === 'DXH' ? 8 : 9
  let digits = ''
  for (let i = 0; i < length; i += 1) digits += String(randomInt(random, 0, 9))
  return prefix + digits
}

function standardCode(random: () => number): string {
  const prefix = pick(random, ['SF', 'CF', 'MA', '1Z', 'COL'])
  let digits = ''
  const length = randomInt(random, 8, 11)
  for (let i = 0; i < length; i += 1) digits += String(randomInt(random, 0, 9))
  return prefix + digits
}

export function buildDemoData(now: Date = new Date()): AllData {
  const random = mulberry32(20261026)
  const distributors: Distributor[] = []
  const sessions: ScanSession[] = []
  const codes: ScanCode[] = []
  const events: ActivityEvent[] = []
  const usedCodes = new Set<string>()

  const makeUniqueCode = (): string => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const code = random() < 0.48 ? senditCode(random) : standardCode(random)
      if (!usedCodes.has(code)) {
        usedCodes.add(code)
        return code
      }
    }
    return `CX${Date.now()}${randomInt(random, 100, 999)}`
  }

  NAMES.forEach((name, index) => {
    const first = addDays(now, -randomInt(random, 25, 60))
    const distributor: Distributor = {
      id: uid('dist'),
      name,
      phone: `06${randomInt(random, 10, 99)} ${randomInt(random, 10, 99)} ${randomInt(random, 10, 99)} ${randomInt(random, 10, 99)}`,
      note: NOTES[index % NOTES.length],
      createdAt: first.toISOString(),
      updatedAt: first.toISOString(),
      archived: false,
    }
    distributors.push(distributor)
  })

  ARCHIVED_NAMES.forEach((name) => {
    const first = addDays(now, -randomInt(random, 45, 80))
    const distributor: Distributor = {
      id: uid('dist'),
      name,
      createdAt: first.toISOString(),
      updatedAt: first.toISOString(),
      archived: true,
      archivedAt: addDays(now, -randomInt(random, 12, 24)).toISOString(),
    }
    distributors.push(distributor)
  })

  const activeDistributors = distributors.filter((distributor) => !distributor.archived)
  const archivedDistributors = distributors.filter((distributor) => distributor.archived)

  for (let dayOffset = 20; dayOffset >= 0; dayOffset -= 1) {
    const day = addDays(now, -dayOffset)
    const sessionsToday = randomInt(random, dayOffset === 0 ? 1 : 1, dayOffset % 5 === 0 ? 3 : 2)
    const pool = dayOffset > 12 && archivedDistributors.length ? archivedDistributors : activeDistributors

    for (let s = 0; s < sessionsToday; s += 1) {
      const distributor = pick(random, pool)
      const start = new Date(day)
      start.setHours(randomInt(random, 8, 17), randomInt(random, 0, 59), 0, 0)
      const codeCount = randomInt(random, 6, dayOffset === 0 ? 26 : 34)
      const sessionId = uid('sess')
      let scanTime = start.getTime()
      const sessionCodes: ScanCode[] = []

      for (let c = 0; c < codeCount; c += 1) {
        scanTime += randomInt(random, 25, 95) * 1000
        const code = makeUniqueCode()
        sessionCodes.push({
          id: uid('code'),
          code,
          raw: code,
          sessionId,
          distributorId: distributor.id,
          scannedAt: new Date(scanTime).toISOString(),
          source: pick(random, ['camera', 'camera', 'camera', 'manual', 'hid']),
        })
      }

      const endedAt = new Date(scanTime + 120_000).toISOString()
      const session: ScanSession = {
        id: sessionId,
        distributorId: distributor.id,
        distributorName: distributor.name,
        startedAt: start.toISOString(),
        endedAt,
        status: 'completed',
        source: 'camera',
      }
      sessions.push(session)
      codes.push(...sessionCodes)
      distributor.updatedAt = endedAt

      if (dayOffset <= 4) {
        events.push({
          id: uid('evt'),
          at: endedAt,
          type: 'session_end',
          subject: distributor.name,
          detail: String(sessionCodes.length),
        })
      }
    }
  }

  distributors
    .filter((distributor) => distributor.archived)
    .forEach((distributor) => {
      events.push({
        id: uid('evt'),
        at: distributor.archivedAt ?? distributor.updatedAt,
        type: 'distributor_archive',
        subject: distributor.name,
      })
    })

  events.sort((a, b) => b.at.localeCompare(a.at))

  return {
    distributors,
    sessions: sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    codes,
    events: events.slice(0, 120),
  }
}
