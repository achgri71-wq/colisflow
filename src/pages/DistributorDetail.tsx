import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Package,
  Pencil,
  Phone,
  Play,
  ScrollText,
  Trash,
  X,
} from 'lucide-react'
import { useI18n } from '../i18n'
import type { ScanCode } from '../types'
import { useStore, useActiveSession } from '../store/useStore'
import { useDialog } from '../components/Dialog'
import { useToast } from '../components/Toast'
import { useDistributorActions } from '../hooks/useDistributorActions'
import { Avatar, Badge, EmptyState, SearchField, StatCard } from '../components/ui'
import { countSessionCodes, distributorStats, senditSplit } from '../lib/stats'
import { isSendit } from '../lib/codes'
import {
  copyText,
  cx,
  formatDate,
  formatNumber,
  formatTime,
  relativeTime,
  secondsToClock,
} from '../lib/utils'

type Filter = 'all' | 'sendit' | 'standard'

export function DistributorDetailPage() {
  const { id = '' } = useParams()
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const dialog = useDialog()
  const toast = useToast()
  const actions = useDistributorActions()
  const activeSession = useActiveSession()

  const distributor = useStore((state) =>
    state.distributors.find((item) => item.id === id),
  )
  const sessions = useStore((state) => state.sessions)
  const codes = useStore((state) => state.codes)
  const prefixes = useStore((state) => state.settings.senditPrefixes)
  const updateDistributorInfo = useStore((state) => state.updateDistributorInfo)
  const deleteCode = useStore((state) => state.deleteCode)
  const restoreCode = useStore((state) => state.restoreCode)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [visible, setVisible] = useState(150)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!distributor) return
    setPhone(distributor.phone ?? '')
    setNote(distributor.note ?? '')
  }, [distributor?.id, distributor?.phone, distributor?.note, distributor])

  const stats = useMemo(
    () => distributorStats(codes, sessions, id, prefixes),
    [codes, sessions, id, prefixes],
  )

  const codesFor = useMemo(
    () =>
      codes
        .filter((code) => code.distributorId === id)
        .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)),
    [codes, id],
  )

  const sessionsFor = useMemo(
    () =>
      sessions
        .filter((session) => session.distributorId === id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [sessions, id],
  )

  const split = useMemo(() => senditSplit(codesFor, prefixes), [codesFor, prefixes])

  const filteredCodes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return codesFor.filter((code) => {
      if (filter === 'sendit' && !isSendit(code.code, prefixes)) return false
      if (filter === 'standard' && isSendit(code.code, prefixes)) return false
      if (needle && !code.code.toLowerCase().includes(needle)) return false
      return true
    })
  }, [codesFor, query, filter, prefixes])

  if (!distributor) {
    return (
      <div className="page">
        <EmptyState
          icon={<Package size={30} />}
          title={t('dist.notFound')}
          text={t('dist.notFoundText')}
          action={
            <Link to="/distributors" className="btn btn-primary">
              <ArrowLeft size={16} className="flip-rtl" />
              {t('dist.title')}
            </Link>
          }
        />
      </div>
    )
  }

  const isCurrent = activeSession?.distributorId === distributor.id
  const senditCount = split.sendit
  const standardCount = split.standard

  const saveInfo = () => {
    updateDistributorInfo(distributor.id, {
      phone: phone.trim() || undefined,
      note: note.trim() || undefined,
    })
    setEditing(false)
    toast.push({ message: t('dist.infoSaved'), tone: 'success' })
  }

  const removeParcel = async (code: ScanCode) => {
    const confirmed = await dialog.confirm({
      title: t('dist.deleteCodeTitle'),
      message: t('dist.deleteCodeMsg', { code: code.code, name: distributor.name }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!confirmed) return
    const removed = deleteCode(code.id)
    if (!removed) return
    toast.push({
      message: t('dist.codeDeleted'),
      tone: 'warning',
      action: { label: t('common.undo'), onClick: () => restoreCode(removed) },
    })
  }

  const copySession = async (sessionId: string) => {
    const sessionCodes = codes
      .filter((code) => code.sessionId === sessionId)
      .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))
      .map((code) => code.code)
    const ok = await copyText(sessionCodes.join('\n'))
    if (ok) {
      toast.push({
        title: t('common.copied'),
        message: t('dist.sessionCodes', { count: sessionCodes.length }),
        tone: 'info',
      })
    }
  }

  return (
    <div className="page detail-page">
      <Link to="/distributors" className="back-link">
        <ArrowLeft size={16} className="flip-rtl" />
        {t('dist.title')}
      </Link>

      <section className="card detail-head">
        <div className="detail-top">
          <Avatar name={distributor.name} id={distributor.id} size="xl" />
          <div className="detail-title">
            <div className="detail-name-row">
              <h1>{distributor.name}</h1>
              {distributor.archived ? (
                <Badge tone="muted" dot>
                  {t('archive.badge')}
                </Badge>
              ) : isCurrent ? (
                <Badge tone="accent" dot>
                  {t('dashboard.activeTitle')}
                </Badge>
              ) : (
                <Badge tone="accent">{t('search.active')}</Badge>
              )}
            </div>
            <div className="detail-meta">
              <span>
                <CalendarDays size={14} />
                {t('dist.createdAt', { date: formatDate(distributor.createdAt, lang) })}
              </span>
              <span>
                <Clock size={14} />
                {t('dist.updatedAt', { time: relativeTime(distributor.updatedAt, lang) })}
              </span>
            </div>
          </div>
          <div className="detail-actions">
            {distributor.archived ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void actions.restore(distributor)}
              >
                <ArchiveRestore size={15} />
                {t('common.restore')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void actions.resume(distributor)}
              >
                <Play size={15} />
                {isCurrent ? t('dashboard.resume') : t('dist.resume')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void actions.exportExcel(distributor)}
              disabled={!codesFor.length}
            >
              <Download size={15} />
              {t('dist.export')}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => void actions.rename(distributor)}
              aria-label={t('dist.rename')}
              title={t('dist.rename')}
            >
              <Pencil size={16} />
            </button>
            {distributor.archived ? null : (
              <button
                type="button"
                className="icon-btn"
                onClick={() => void actions.archive(distributor)}
                aria-label={t('common.archive')}
                title={t('common.archive')}
              >
                <Archive size={16} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              onClick={async () => {
                const removed = await actions.remove(distributor)
                if (removed) navigate('/distributors')
              }}
              aria-label={t('common.delete')}
              title={t('common.delete')}
            >
              <Trash size={16} />
            </button>
          </div>
        </div>

        {editing ? (
          <form
            className="info-editor"
            onSubmit={(event) => {
              event.preventDefault()
              saveInfo()
            }}
          >
            <div className="info-editor-fields">
              <div className="field">
                <label className="field-label" htmlFor="dist-phone">
                  {t('common.phone')}
                </label>
                <input
                  id="dist-phone"
                  className="input"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={t('dist.phonePlaceholder')}
                  inputMode="tel"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="dist-note">
                  {t('common.note')}
                </label>
                <input
                  id="dist-note"
                  className="input"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t('dist.notePlaceholder')}
                />
              </div>
            </div>
            <div className="info-editor-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                <X size={15} />
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                <Check size={15} />
                {t('common.save')}
              </button>
            </div>
          </form>
        ) : (
          <div className="detail-contact">
            {distributor.phone ? (
              <a href={`tel:${distributor.phone}`} className="contact-chip">
                <Phone size={14} />
                {distributor.phone}
              </a>
            ) : null}
            {distributor.note ? (
              <span className="contact-note">
                <ScrollText size={14} />
                {distributor.note}
              </span>
            ) : null}
            {!distributor.phone && !distributor.note ? (
              <span className="contact-empty">{t('dist.addNote')}</span>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setEditing(true)}
            >
              <Pencil size={13} />
              {t('common.edit')}
            </button>
          </div>
        )}
      </section>

      <section className="kpi-grid detail-kpis">
        <StatCard
          icon={<Package size={19} />}
          label={t('common.parcels')}
          value={formatNumber(stats.parcels, lang)}
          sub={`${formatNumber(sessionsFor.length, lang)} ${t('common.sessions')}`}
        />
        <StatCard
          icon={<Clock size={19} />}
          label={t('dist.sessions')}
          value={formatNumber(stats.sessions, lang)}
          sub={
            stats.lastScan
              ? t('dist.lastScan', { time: relativeTime(stats.lastScan, lang) })
              : t('dist.noScan')
          }
          tone="info"
        />
      </section>

      <div className="detail-grid">
        <section className="card codes-card">
          <div className="card-head">
            <div className="codes-heading">
              <h2>{t('dist.codesTitle')}</h2>
              <Badge tone="accent">{formatNumber(codesFor.length, lang)}</Badge>
            </div>
            <div className="codes-tools">
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder={t('dist.filterCodes')}
              />
            </div>
          </div>

          <div className="filter-row">
            {(
              [
                { key: 'all', label: t('scan.filterAll'), count: codesFor.length },
                { key: 'sendit', label: t('common.sendit'), count: senditCount },
                { key: 'standard', label: t('common.standard'), count: standardCount },
              ] as { key: Filter; label: string; count: number }[]
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                className={cx('chip', filter === item.key && 'is-active')}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
                <span className="chip-count">{item.count}</span>
              </button>
            ))}
          </div>

          {filteredCodes.length ? (
            <>
              <div className="code-list">
                {filteredCodes.slice(0, visible).map((code, index) => {
                  const sendit = isSendit(code.code, prefixes)
                  return (
                    <div className="code-row" key={code.id}>
                      <span className="code-index">{String(index + 1).padStart(2, '0')}</span>
                      <div className="code-main">
                        <span className="code-mono">{code.code}</span>
                        <span className="code-sub">
                          {formatDate(code.scannedAt, lang)}
                          <span className="dot-sep">·</span>
                          {formatTime(code.scannedAt, lang)}
                          {code.movedFrom?.distributorName ? (
                            <>
                              <span className="dot-sep">·</span>
                              {t('scan.moved', { name: code.movedFrom.distributorName })}
                            </>
                          ) : null}
                        </span>
                      </div>
                      <Badge tone={sendit ? 'accent' : 'neutral'}>
                        {sendit ? t('common.sendit') : t('common.standard')}
                      </Badge>
                      <div className="code-actions">
                        <button
                          type="button"
                          className="icon-btn icon-btn-sm"
                          onClick={() =>
                            void copyText(code.code).then((ok) => {
                              if (ok) toast.push({ title: t('common.copied'), tone: 'info', duration: 1400 })
                            })
                          }
                          aria-label={t('common.copy')}
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-sm icon-btn-danger"
                          onClick={() => void removeParcel(code)}
                          aria-label={t('common.delete')}
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {filteredCodes.length > visible ? (
                <div className="code-list-more">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setVisible((current) => current + 200)}
                  >
                    {t('common.loadMore')}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState
              compact
              icon={<Package size={24} />}
              title={t('dist.codesEmpty')}
              text={query || filter !== 'all' ? t('dist.emptyFilter') : undefined}
            />
          )}
        </section>

        <section className="card sessions-card">
          <div className="card-head">
            <div>
              <h2>{t('dist.sessions')}</h2>
              <p>{t('dist.recentSessions')}</p>
            </div>
            <Badge tone="neutral">{formatNumber(sessionsFor.length, lang)}</Badge>
          </div>

          {sessionsFor.length ? (
            <div className="session-list">
              {sessionsFor.map((session) => {
                const count = countSessionCodes(codes, session.id)
                const duration = session.endedAt
                  ? secondsToClock(
                      (new Date(session.endedAt).getTime() -
                        new Date(session.startedAt).getTime()) /
                        1000,
                    )
                  : null
                const open = expanded === session.id
                return (
                  <div className={cx('session-item', open && 'is-open')} key={session.id}>
                    <button
                      type="button"
                      className="session-row"
                      onClick={() => setExpanded(open ? null : session.id)}
                      aria-expanded={open}
                    >
                      <span className="session-date">
                        <strong>{formatDate(session.startedAt, lang)}</strong>
                        <span>{formatTime(session.startedAt, lang)}</span>
                      </span>
                      <Badge
                        tone={
                          session.status === 'active'
                            ? 'warning'
                            : session.status === 'cancelled'
                              ? 'muted'
                              : 'accent'
                        }
                      >
                        {t(`dist.sessionStatus.${session.status}`)}
                      </Badge>
                      <span className="session-count">
                        {formatNumber(count, lang)} {t('common.parcels')}
                      </span>
                      {duration ? <span className="session-duration mono">{duration}</span> : null}
                      <ChevronDown size={16} className={cx('session-chevron', open && 'is-open')} />
                    </button>
                    {open ? (
                      <div className="session-detail">
                        {count ? (
                          <>
                            <div className="session-code-grid">
                              {codes
                                .filter((code) => code.sessionId === session.id)
                                .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))
                                .map((code) => (
                                  <span className="session-code" key={code.id}>
                                    <span className="code-mono">{code.code}</span>
                                    <span>{formatTime(code.scannedAt, lang)}</span>
                                  </span>
                                ))}
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => void copySession(session.id)}
                            >
                              <Copy size={13} />
                              {t('common.copy')}
                            </button>
                          </>
                        ) : (
                          <span className="session-empty">{t('dist.noSessions')}</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState compact icon={<Clock size={22} />} title={t('dist.noSessions')} />
          )}
        </section>
      </div>
    </div>
  )
}
