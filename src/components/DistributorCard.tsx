import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  Download,
  EllipsisVertical,
  Pencil,
  Play,
  Trash2,
  ChevronRight,
} from 'lucide-react'
import { useI18n } from '../i18n'
import type { Distributor } from '../types'
import type { DistributorStats } from '../lib/stats'
import { cx, relativeTime } from '../lib/utils'
import { Badge } from './ui'

interface MenuItem {
  label: string
  icon: ReactNode
  onClick: () => void
  tone?: 'danger'
}

function CardMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={cx('icon-btn', open && 'is-open')}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <EllipsisVertical size={18} />
      </button>
      {open ? (
        <div className="menu-pop" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={cx('menu-item', item.tone === 'danger' && 'is-danger')}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function DistributorCard({
  distributor,
  stats,
  onResume,
  onExport,
  onRename,
  onArchive,
  onRestore,
  onDelete,
}: {
  distributor: Distributor
  stats: DistributorStats
  onResume: () => void
  onExport: () => void
  onRename: () => void
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
}) {
  const { t, lang } = useI18n()
  const archived = distributor.archived
  const parcelsLabel = stats.parcels === 1 ? t('common.parcel') : t('common.parcels')
  const sessionsLabel = stats.sessions === 1 ? t('common.session') : t('common.sessions')

  return (
    <article className={cx('dist-card', archived && 'is-archived')}>
      <div className="dist-card-top">
        <span className="dist-avatar">
          <span className="dist-avatar-ring" />
          <span className="dist-avatar-text">{distributor.name.slice(0, 1).toUpperCase()}</span>
        </span>
        <div className="dist-identity">
          <Link to={`/distributors/${distributor.id}`} className="dist-name">
            {distributor.name}
          </Link>
          <div className="dist-meta">
            {archived ? (
              <Badge tone="muted" dot>
                {t('archive.badge')}
              </Badge>
            ) : stats.lastScan ? (
              <span>{t('dist.lastScan', { time: relativeTime(stats.lastScan, lang) })}</span>
            ) : (
              <span>{t('dist.noScan')}</span>
            )}
          </div>
        </div>
        <CardMenu
          label={t('dist.more')}
          items={[
            {
              label: t('dist.rename'),
              icon: <Pencil size={15} />,
              onClick: onRename,
            },
            {
              label: t('dist.export'),
              icon: <Download size={15} />,
              onClick: onExport,
            },
            archived
              ? {
                  label: t('common.restore'),
                  icon: <ArchiveRestore size={15} />,
                  onClick: onRestore,
                }
              : {
                  label: t('common.archive'),
                  icon: <Archive size={15} />,
                  onClick: onArchive,
                },
            {
              label: t('common.delete'),
              icon: <Trash2 size={15} />,
              onClick: onDelete,
              tone: 'danger',
            },
          ]}
        />
      </div>

      {distributor.note ? <p className="dist-note">{distributor.note}</p> : null}

      <div className="dist-stats">
        <div className="dist-stat">
          <strong>{stats.parcels}</strong>
          <span>{parcelsLabel}</span>
        </div>
        <div className="dist-stat">
          <strong>{stats.sessions}</strong>
          <span>{sessionsLabel}</span>
        </div>
      </div>

      <div className="dist-card-actions">
        <Link to={`/distributors/${distributor.id}`} className="btn btn-ghost btn-sm">
          {t('dist.details')}
          <ChevronRight size={15} className="flip-rtl" />
        </Link>
        {archived ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRestore}>
            <ArchiveRestore size={15} />
            {t('common.restore')}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={onResume}>
            <Play size={15} />
            {t('dist.resume')}
          </button>
        )}
      </div>
    </article>
  )
}
