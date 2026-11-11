import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Boxes,
  ChevronRight,
  CircleCheck,
  CircleX,
  FileDown,
  FileUp,
  MoveRight,
  Package,
  PackageCheck,
  Pencil,
  Percent,
  Play,
  Plus,
  RotateCcw,
  ScanBarcode,
  ShieldCheck,
  Sparkles,
  Trash,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { ActivityType } from '../types'
import { useI18n } from '../i18n'
import type { TranslationKey } from '../i18n/dict'
import { useStore, useActiveSession } from '../store/useStore'
import { useDialog } from '../components/Dialog'
import { useToast } from '../components/Toast'
import { BrandMark } from '../components/Layout'
import { PageHeader, StatCard, Avatar, EmptyState, Badge } from '../components/ui'
import { ActivityChart, SenditDonut } from '../components/Charts'
import { StartSessionModal } from '../components/StartSessionModal'
import {
  dailySeries,
  senditSplit,
  summary as buildSummary,
  topDistributors,
} from '../lib/stats'
import { useNow } from '../hooks/useNow'
import {
  formatDate,
  formatNumber,
  formatPercent,
  formatTime,
  relativeTime,
  secondsToClock,
  cx,
} from '../lib/utils'

const ACTIVITY_ICONS = {
  session_start: Play,
  session_end: CircleCheck,
  session_cancel: CircleX,
  code_move: MoveRight,
  code_delete: Trash,
  distributor_rename: Pencil,
  distributor_archive: Archive,
  distributor_restore: ArchiveRestore,
  distributor_delete: Trash,
  import: FileUp,
  export: FileDown,
  demo: Sparkles,
  reset: RotateCcw,
} satisfies Record<ActivityType, typeof Play>

const ACTIVITY_KEYS: Record<ActivityType, TranslationKey> = {
  session_start: 'activity.session_start',
  session_end: 'activity.session_end',
  session_cancel: 'activity.session_cancel',
  code_move: 'activity.code_move',
  code_delete: 'activity.code_delete',
  distributor_rename: 'activity.distributor_rename',
  distributor_archive: 'activity.distributor_archive',
  distributor_restore: 'activity.distributor_restore',
  distributor_delete: 'activity.distributor_delete',
  import: 'activity.import',
  export: 'activity.export',
  demo: 'activity.demo',
  reset: 'activity.reset',
}

const ACTIVITY_TONES: Record<ActivityType, string> = {
  session_start: 'accent',
  session_end: 'accent',
  session_cancel: 'danger',
  code_move: 'info',
  code_delete: 'danger',
  distributor_rename: 'neutral',
  distributor_archive: 'warning',
  distributor_restore: 'accent',
  distributor_delete: 'danger',
  import: 'info',
  export: 'info',
  demo: 'accent',
  reset: 'danger',
}

export function DashboardPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const dialog = useDialog()
  const toast = useToast()

  const distributors = useStore((state) => state.distributors)
  const sessions = useStore((state) => state.sessions)
  const codes = useStore((state) => state.codes)
  const events = useStore((state) => state.events)
  const settings = useStore((state) => state.settings)
  const startSession = useStore((state) => state.startSession)
  const seedDemo = useStore((state) => state.seedDemo)

  const activeSession = useActiveSession()
  const now = useNow(Boolean(activeSession))
  const [startOpen, setStartOpen] = useState(false)

  const summary = useMemo(
    () => buildSummary(distributors, sessions, codes, settings.senditPrefixes),
    [distributors, sessions, codes, settings.senditPrefixes],
  )
  const points = useMemo(
    () => dailySeries(codes, 14, settings.senditPrefixes),
    [codes, settings.senditPrefixes],
  )
  const split = useMemo(
    () => senditSplit(codes, settings.senditPrefixes),
    [codes, settings.senditPrefixes],
  )
  const top = useMemo(
    () => topDistributors(distributors, codes, 5, settings.senditPrefixes),
    [distributors, codes, settings.senditPrefixes],
  )

  const activeCount = activeSession
    ? codes.filter((code) => code.sessionId === activeSession.id).length
    : 0
  const elapsed = activeSession
    ? secondsToClock((now - new Date(activeSession.startedAt).getTime()) / 1000)
    : ''

  const [quickName, setQuickName] = useState('')
  const quickRecent = useMemo(
    () =>
      distributors
        .filter((distributor) => !distributor.archived)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 4),
    [distributors],
  )

  const isEmpty = distributors.length === 0 && codes.length === 0

  const runDemo = async () => {
    const confirmed = await dialog.confirm({
      title: t('settings.demoTitle'),
      message: t('settings.demoMsg'),
      confirmLabel: t('settings.demoAction'),
      tone: 'primary',
    })
    if (!confirmed) return
    await seedDemo()
    toast.push({ message: t('settings.demoDone'), tone: 'success' })
  }

  const startQuick = () => {
    const clean = quickName.trim()
    if (!clean) return
    startSession(clean, 'manual')
    navigate('/scan')
  }

  const greeting = settings.operatorName
    ? t('dashboard.greeting', { name: settings.operatorName })
    : t('dashboard.greetingAnon')

  return (
    <div className="page dashboard-page">
      <PageHeader
        eyebrow={formatDate(new Date(), lang, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        title={greeting}
        subtitle={
          settings.shopName
            ? `${settings.shopName} — ${t('dashboard.subtitle')}`
            : t('dashboard.subtitle')
        }
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setStartOpen(true)}>
            <Plus size={17} />
            {t('dashboard.newSession')}
          </button>
        }
      />

      {isEmpty ? (
        <>
          <section className="empty-hero">
            <div className="empty-hero-glow" aria-hidden="true" />
            <div className="empty-hero-mark">
              <BrandMark size={64} />
            </div>
            <div className="empty-hero-copy">
              <div className="eyebrow">{t('app.tagline')}</div>
              <h2>{t('dashboard.empty.title')}</h2>
              <p>{t('dashboard.empty.text')}</p>
              <div className="empty-hero-actions">
                <button type="button" className="btn btn-primary btn-lg" onClick={() => setStartOpen(true)}>
                  <ScanBarcode size={19} />
                  {t('dashboard.empty.start')}
                </button>
                <button type="button" className="btn btn-secondary btn-lg" onClick={() => void runDemo()}>
                  <Sparkles size={18} />
                  {t('dashboard.empty.demo')}
                </button>
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          {activeSession ? (
            <section className="active-banner">
              <div className="active-banner-main">
                <span className="live-badge">
                  <span className="pulse-dot" />
                  {t('dashboard.activeTitle')}
                </span>
                <strong className="active-name">{activeSession.distributorName}</strong>
                <span className="active-meta">
                  {t('dashboard.activeText', {
                    count: formatNumber(activeCount, lang),
                    time: formatTime(activeSession.startedAt, lang),
                  })}
                </span>
              </div>
              <div className="active-banner-side">
                <span className="active-clock" aria-label={t('scan.duration')}>
                  {elapsed}
                </span>
                <Link to="/scan" className="btn btn-primary btn-sm">
                  {t('dashboard.resume')}
                  <ArrowRight size={15} className="flip-rtl" />
                </Link>
              </div>
            </section>
          ) : null}

          <section className="kpi-grid">
            <StatCard
              icon={<PackageCheck size={19} />}
              label={t('dashboard.kpi.today')}
              value={formatNumber(summary.todayParcels, lang)}
              sub={
                summary.todayDelta === null ? (
                  <span className="delta-flat">—</span>
                ) : summary.todayDelta === 0 ? (
                  <span className="delta-flat">{t('stats.stable')}</span>
                ) : (
                  <span className={cx('delta', summary.todayDelta > 0 ? 'is-up' : 'is-down')}>
                    {summary.todayDelta > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {formatPercent(Math.abs(summary.todayDelta), lang)}
                    <span className="delta-label">{t('stats.vsYesterday')}</span>
                  </span>
                )
              }
            />
            <StatCard
              icon={<Boxes size={19} />}
              label={t('dashboard.kpi.distributors')}
              value={formatNumber(summary.activeDistributors, lang)}
              sub={t('dashboard.kpi.sessions', { count: formatNumber(summary.totalSessions, lang) })}
              tone="info"
            />
            <StatCard
              icon={<Package size={19} />}
              label={t('dashboard.kpi.total')}
              value={formatNumber(summary.totalParcels, lang)}
              sub={`${formatNumber(summary.archivedDistributors, lang)} ${t('common.archived').toLowerCase()}`}
              tone="neutral"
            />
            <StatCard
              icon={<Percent size={19} />}
              label={t('dashboard.kpi.sendit')}
              value={formatPercent(summary.senditShare, lang)}
              sub={`${formatNumber(summary.senditParcels, lang)} ${t('common.sendit')}`}
              tone="warning"
            />
          </section>

          {!activeSession ? (
            <section className="quick-card">
              <div className="quick-copy">
                <div className="quick-icon"><ScanBarcode size={20} /></div>
                <div>
                  <h3>{t('dashboard.quickTitle')}</h3>
                  <p>{t('dashboard.quickText')}</p>
                </div>
              </div>
              <form
                className="quick-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  startQuick()
                }}
              >
                <input
                  className="input"
                  value={quickName}
                  onChange={(event) => setQuickName(event.target.value)}
                  placeholder={t('dashboard.distributorPlaceholder')}
                  aria-label={t('scan.distributor')}
                  autoComplete="off"
                  list="quick-distributors"
                />
                <datalist id="quick-distributors">
                  {quickRecent.map((distributor) => (
                    <option key={distributor.id} value={distributor.name} />
                  ))}
                </datalist>
                <button type="submit" className="btn btn-primary" disabled={!quickName.trim()}>
                  {t('dashboard.start')}
                  <ArrowRight size={15} className="flip-rtl" />
                </button>
              </form>
              {quickRecent.length ? (
                <div className="quick-recent">
                  <span className="quick-recent-label">{t('dashboard.recent')}</span>
                  {quickRecent.map((distributor) => (
                    <button
                      type="button"
                      key={distributor.id}
                      className="recent-chip recent-chip-sm"
                      onClick={() => setQuickName(distributor.name)}
                    >
                      <Avatar name={distributor.name} id={distributor.id} size="sm" />
                      <span className="recent-chip-name">{distributor.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="dashboard-grid">
            <article className="card chart-card">
              <div className="card-head">
                <div>
                  <h2>{t('dashboard.chart.title')}</h2>
                  <p>{t('dashboard.chart.subtitle')}</p>
                </div>
                <div className="chart-legend">
                  <span className="legend-inline">
                    <span className="legend-dot legend-dot-accent" />
                    {t('common.sendit')}
                  </span>
                  <span className="legend-inline">
                    <span className="legend-dot" />
                    {t('common.other')}
                  </span>
                </div>
              </div>
              <ActivityChart points={points} />
            </article>

            <article className="card chart-card">
              <div className="card-head">
                <div>
                  <h2>{t('dashboard.split.title')}</h2>
                  <p>{t('dashboard.split.subtitle')}</p>
                </div>
              </div>
              <SenditDonut
                sendit={split.sendit}
                standard={split.standard}
                total={split.total}
                share={split.share}
              />
            </article>
          </section>

          <section className="dashboard-grid dashboard-grid-even">
            <article className="card">
              <div className="card-head">
                <div>
                  <h2>{t('dashboard.top.title')}</h2>
                  <p>{t('dashboard.top.subtitle')}</p>
                </div>
                <Link to="/distributors" className="card-link">
                  {t('dashboard.viewAll')}
                  <ChevronRight size={14} className="flip-rtl" />
                </Link>
              </div>
              {top.length ? (
                <div className="top-list">
                  {top.map((entry, index) => {
                    const max = top[0]?.parcels || 1
                    return (
                      <Link
                        to={`/distributors/${entry.distributor.id}`}
                        className="top-row"
                        key={entry.distributor.id}
                      >
                        <span className="top-rank">{String(index + 1).padStart(2, '0')}</span>
                        <Avatar
                          name={entry.distributor.name}
                          id={entry.distributor.id}
                          size="sm"
                        />
                        <div className="top-info">
                          <div className="top-name-row">
                            <span className="top-name">{entry.distributor.name}</span>
                            <span className="top-count">
                              {formatNumber(entry.parcels, lang)}
                            </span>
                          </div>
                          <div className="top-bar">
                            <span style={{ width: `${(entry.parcels / max) * 100}%` }} />
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <EmptyState compact title={t('dashboard.top.empty')} icon={<Boxes size={22} />} />
              )}
            </article>

            <article className="card">
              <div className="card-head">
                <div>
                  <h2>{t('dashboard.activity.title')}</h2>
                  <p>{t('dashboard.activity.title')}</p>
                </div>
              </div>
              {events.length ? (
                <div className="activity-feed">
                  {events.slice(0, 7).map((event) => {
                    const Icon = ACTIVITY_ICONS[event.type] ?? CircleCheck
                    return (
                      <div className="activity-row" key={event.id}>
                        <span className={cx('activity-icon', `tone-${ACTIVITY_TONES[event.type]}`)}>
                          <Icon size={14} />
                        </span>
                        <div className="activity-copy">
                          <span className="activity-text">
                            {t(ACTIVITY_KEYS[event.type], {
                              subject: event.subject ?? '',
                              detail: event.detail ?? '',
                            })}
                          </span>
                          <span className="activity-time">
                            {relativeTime(event.at, lang)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyState
                  compact
                  title={t('dashboard.activity.empty')}
                  icon={<CircleCheck size={22} />}
                />
              )}
            </article>
          </section>
        </>
      )}

      <footer className="local-note">
        <ShieldCheck size={15} />
        <span>{t('dashboard.footer')}</span>
        {!activeSession && !isEmpty ? (
          <Badge tone="accent" dot>
            {t('common.local')}
          </Badge>
        ) : null}
      </footer>

      <StartSessionModal open={startOpen} onClose={() => setStartOpen(false)} />
    </div>
  )
}
