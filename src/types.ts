export type Language = 'fr' | 'en' | 'ar'
export type ThemeMode = 'dark' | 'light' | 'system'
export type CodeSource = 'camera' | 'manual' | 'hid' | 'import'
export type SessionStatus = 'active' | 'completed' | 'cancelled'

export interface Distributor {
  id: string
  name: string
  phone?: string
  note?: string
  createdAt: string
  updatedAt: string
  archived: boolean
  archivedAt?: string
}

export interface ScanSession {
  id: string
  distributorId: string
  distributorName: string
  startedAt: string
  endedAt?: string
  status: SessionStatus
  source: CodeSource
}

export interface ScanCode {
  id: string
  code: string
  raw?: string
  sessionId: string
  distributorId: string
  scannedAt: string
  source: CodeSource
  movedFrom?: {
    distributorId: string
    distributorName: string
  }
}

export type ActivityType =
  | 'session_start'
  | 'session_end'
  | 'session_cancel'
  | 'code_move'
  | 'code_delete'
  | 'distributor_rename'
  | 'distributor_archive'
  | 'distributor_restore'
  | 'distributor_delete'
  | 'import'
  | 'export'
  | 'demo'
  | 'reset'

export interface ActivityEvent {
  id: string
  at: string
  type: ActivityType
  subject?: string
  detail?: string
}

export interface Settings {
  lang: Language
  theme: ThemeMode
  shopName: string
  operatorName: string
  senditPrefixes: string[]
  sound: boolean
  haptics: boolean
  keepAwake: boolean
  sudUrl: string
  sudKey: string
}

export interface BackupPayload {
  app: 'colisflow'
  version: 1
  exportedAt: string
  distributors: Distributor[]
  sessions: ScanSession[]
  codes: ScanCode[]
  events: ActivityEvent[]
  settings?: Partial<Settings>
}

export interface AddCodeResult {
  status: 'added' | 'moved' | 'duplicate' | 'invalid' | 'no-session'
  code?: string
  codeId?: string
  movedFrom?: { distributorId: string; distributorName: string }
}

export interface BulkAddResult {
  added: number
  duplicates: number
  moved: number
  invalid: number
  movedList: { code: string; from: string }[]
  newCodes: ScanCode[]
  removed: ScanCode[]
}

export interface ScannerImportResult {
  created: number
  updated: number
  added: number
  moved: number
  duplicates: number
}

/** One distributor list as read from the Colis Scanner app. */
export interface ScanDistributor {
  id: string
  name: string
  codes: string[]
  date?: string
  archived: boolean
}
