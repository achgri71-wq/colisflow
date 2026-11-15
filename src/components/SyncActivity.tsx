import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CloudDownload,
  RefreshCw,
  UserX,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { useI18n } from '../i18n'
import type { TranslationKey } from '../i18n/dict'
import { useStore } from '../store/useStore'
import { cx, formatDateTime, formatNumber, relativeTime } from '../lib/utils'
import { Badge } from './ui'
import type { SyncLogEntry, SyncStatus } from '../types'

type BadgeTone = 'neutral' | 'accent' | 'warning' | 'danger' | 'info' | 'muted'

const STATUS_META: Record<SyncStatus, { tone: BadgeTone; icon: LucideIcon; key: TranslationKey }> = {
  ok: { tone: 'info', icon: CheckCircle2, key: 'sync.statusOk' },
  error: { tone: 'danger', icon: AlertTriangle, key: 'sync.statusError' },
  'no-account': { tone: 'muted', icon: UserX, key: 'sync.statusNoAccount' },
  offline: { tone: 'warning', icon: WifiOff, key: 'sync.statusOffline' },
}

function useEntryText() {
  const { t, lang } = useI18n()
  return (entry: SyncLogEntry): string => {
    if (entry.status === 'ok') {
      if (entry.added === 0 && entry.moved === 0) {
        return t('sync.okIdle', { lists: formatNumber(entry.lists, lang) })
      }
      return t('sync.okDetail', {
        added: formatNumber(entry.added, lang),
        moved: formatNumber(entry.moved, lang),
      })
    }
    if (entry.status === 'error') {
      return entry.message ? t(entry.message as TranslationKey) : t('sync.statusError')
    }
    return t(entry.status === 'offline' ? 'sync.offlineHint' : 'sync.noAccountHint')
  }
}

/**
 * Colis Scanner → ColisFlow sync history. Collapsed by default: the header
 * already answers "did it sync?", and the log opens on demand.
 */
export function SyncActivity() {
  const { t, lang } = useI18n()
  const syncLog = useStore((state) => state.syncLog)
  const entryText = useEntryText()
  const [open, setOpen] = useState(false)

  const last = syncLog[0]
  const meta = last ? STATUS_META[last.status] : null
  const StatusIcon = meta?.icon ?? RefreshCw

  return (
    <section className={cx('card sync-card', open && 'is-open')}>
      <button
        type="button"
        className="sync-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="sync-head-icon">
          <CloudDownload size={18} />
        </span>
        <span className="sync-head-copy">
          <span className="sync-head-title">{t('sync.title')}</span>
          <span className="sync-head-sub">
            {last
              ? t('sync.lastAttempt', { when: relativeTime(last.at, lang) })
              : t('sync.none')}
          </span>
        </span>
        {meta ? (
          <Badge tone={meta.tone}>
            <StatusIcon size={12} />
            {t(meta.key)}
          </Badge>
        ) : null}
        <ChevronDown size={18} className={cx('sync-chevron', open && 'is-open')} />
      </button>

      {open ? (
        syncLog.length ? (
          <div className="activity-feed sync-feed">
            {syncLog.map((entry) => {
              const item = STATUS_META[entry.status]
              const Icon = item.icon
              return (
                <div className="activity-row" key={entry.id}>
                  <span className={cx('activity-icon', `tone-${item.tone}`)}>
                    <Icon size={15} />
                  </span>
                  <div className="activity-copy">
                    <span className="activity-text">{entryText(entry)}</span>
                    <span className="activity-time">{formatDateTime(entry.at, lang)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="sync-empty">{t('sync.empty')}</p>
        )
      ) : null}
    </section>
  )
}
