import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Camera,
  ChevronRight,
  Copy,
  FilterX,
  Package,
  Plus,
  ScanBarcode,
  Search,
} from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore, useActiveSession } from '../store/useStore'
import { useToast } from '../components/Toast'
import { ScannerModal } from '../components/ScannerModal'
import { Avatar, Badge, EmptyState, PageHeader, SearchField, Segmented } from '../components/ui'
import { distributorStats } from '../lib/stats'
import { isSendit } from '../lib/codes'
import { multiSearchCodes, parseMultiCodes } from '../lib/multiSearch'
import {
  copyText,
  cx,
  formatDate,
  formatNumber,
  formatTime,
  relativeTime,
} from '../lib/utils'

type Filter = 'all' | 'parcels' | 'distributors'

function Highlight({ text, needle }: { text: string; needle: string }) {
  const clean = needle.trim()
  if (!clean) return <>{text}</>
  const index = text.toLowerCase().indexOf(clean.toLowerCase())
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + clean.length)}</mark>
      {text.slice(index + clean.length)}
    </>
  )
}

export function SearchPage() {
  const { t, lang } = useI18n()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [mode, setMode] = useState<'single' | 'multi'>('single')
  const [blob, setBlob] = useState('')
  const [multiCodes, setMultiCodes] = useState<string[]>([])
  const deferredQuery = useDeferredValue(query)

  const distributors = useStore((state) => state.distributors)
  const sessions = useStore((state) => state.sessions)
  const codes = useStore((state) => state.codes)
  const prefixes = useStore((state) => state.settings.senditPrefixes)
  const addCode = useStore((state) => state.addCode)
  const activeSession = useActiveSession()

  const needle = deferredQuery.trim().toLowerCase()
  const distributorNames = useMemo(
    () => new Map(distributors.map((distributor) => [distributor.id, distributor.name])),
    [distributors],
  )

  const distributorMatches = useMemo(() => {
    if (!needle) return []
    return distributors.filter(
      (distributor) =>
        distributor.name.toLowerCase().includes(needle) ||
        (distributor.note ?? '').toLowerCase().includes(needle) ||
        (distributor.phone ?? '').toLowerCase().includes(needle),
    )
  }, [distributors, needle])

  const codeMatches = useMemo(() => {
    if (!needle) return []
    return codes
      .filter((code) => {
        if (code.code.toLowerCase().includes(needle)) return true
        const name = distributorNames.get(code.distributorId) ?? ''
        return name.toLowerCase().includes(needle)
      })
      .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
  }, [codes, needle, distributorNames])

  const statsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof distributorStats>>()
    for (const distributor of distributorMatches) {
      map.set(distributor.id, distributorStats(codes, sessions, distributor.id, prefixes))
    }
    return map
  }, [distributorMatches, codes, sessions, prefixes])

  const showDistributors = filter !== 'parcels'
  const showParcels = filter !== 'distributors'
  const visibleDistributors = showDistributors ? distributorMatches : []
  const visibleCodes = showParcels ? codeMatches.slice(0, 60) : []
  const resultCount = visibleDistributors.length + visibleCodes.length

  const blobCodes = useMemo(() => parseMultiCodes(blob), [blob])

  const multiResult = useMemo(
    () => (multiCodes.length ? multiSearchCodes(multiCodes, { codes, distributors }) : null),
    [multiCodes, codes, distributors],
  )

  const runMulti = () => setMultiCodes(parseMultiCodes(blob))

  const clearMulti = () => {
    setBlob('')
    setMultiCodes([])
  }

  const modeChips: { value: 'single' | 'multi'; label: string }[] = [
    { value: 'single', label: t('search.modeSingle') },
    { value: 'multi', label: t('search.modeMulti') },
  ]

  const addToSession = (code: string) => {
    if (!activeSession) {
      toast.push({ message: t('search.noSession'), tone: 'warning' })
      return
    }
    const result = addCode(code, 'manual')
    if (result.status === 'duplicate') {
      toast.push({ title: t('search.duplicate'), message: code, tone: 'warning' })
    } else if (result.status === 'moved') {
      toast.push({
        title: t('search.moved'),
        message: t('scan.moved', { name: result.movedFrom?.distributorName ?? '' }),
        tone: 'info',
      })
    } else if (result.status === 'added') {
      toast.push({ title: t('search.added'), message: code, tone: 'success' })
    } else {
      toast.push({ message: t('scan.manualEmpty'), tone: 'error' })
    }
  }

  const copy = async (code: string) => {
    const ok = await copyText(code)
    if (ok) toast.push({ title: t('common.copied'), message: code, tone: 'info', duration: 1500 })
  }

  const filters: { key: Filter; label: string; count: number }[] = [
    {
      key: 'all',
      label: t('common.all'),
      count: distributorMatches.length + codeMatches.length,
    },
    { key: 'parcels', label: t('search.parcels'), count: codeMatches.length },
    { key: 'distributors', label: t('search.distributors'), count: distributorMatches.length },
  ]

  return (
    <div className="page search-page">
      <PageHeader
        title={t('search.title')}
        actions={
          mode === 'single' ? (
            <button type="button" className="btn btn-primary" onClick={() => setCameraOpen(true)}>
              <Camera size={17} />
              {t('search.scan')}
            </button>
          ) : undefined
        }
      />

      <section className="card search-hero">
        <div className="search-mode-row">
          <Segmented value={mode} options={modeChips} onChange={setMode} />
        </div>

        {mode === 'single' ? (
          <>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder={t('search.placeholder')}
              autoFocus
              size="lg"
            />
            <div className="search-hero-row">
              <div className="filter-row">
                {filters.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={cx('chip', filter === item.key && 'is-active')}
                    onClick={() => setFilter(item.key)}
                  >
                    {item.label}
                    {item.count ? <span className="chip-count">{item.count}</span> : null}
                  </button>
                ))}
              </div>
              {activeSession ? (
                <span className="search-session-hint">
                  <span className="pulse-dot" />
                  {t('scan.sessionOf', { name: activeSession.distributorName })}
                </span>
              ) : (
                <span className="search-session-hint is-muted">{t('search.noActiveSession')}</span>
              )}
            </div>
          </>
        ) : (
          <div className="multi-search">
            <p className="multi-hint">{t('search.multiHint')}</p>
            <textarea
              className="textarea input-mono multi-input"
              value={blob}
              onChange={(event) => setBlob(event.target.value)}
              placeholder={t('search.multiPlaceholder')}
              spellCheck={false}
              autoComplete="off"
            />
            <div className="multi-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={runMulti}
                disabled={blobCodes.length === 0}
              >
                <Search size={16} />
                {t('search.multiRun')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setCameraOpen(true)}>
                <Camera size={16} />
                {t('search.multiScan')}
              </button>
              {blob ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearMulti}>
                  <FilterX size={15} />
                  {t('search.multiReset')}
                </button>
              ) : null}
              <span className="multi-count">
                {t('search.multiCount', { count: formatNumber(blobCodes.length, lang) })}
              </span>
            </div>
          </div>
        )}
      </section>

      {mode === 'multi' ? (
        !multiResult ? (
          <EmptyState
            icon={<Search size={30} />}
            title={t('search.multiStart')}
            text={t('search.multiHint')}
          />
        ) : (
          <>
            <div className="search-summary">
              <span>
                {t('search.multiFound', { count: formatNumber(multiResult.found, lang) })} ·{' '}
                {t('search.multiMissing', { count: formatNumber(multiResult.missing, lang) })}
              </span>
            </div>

            <section className="card search-section">
              <div className="card-head">
                <div className="codes-heading">
                  <h2>{t('search.multiResults')}</h2>
                  <Badge tone="accent">{formatNumber(multiResult.total, lang)}</Badge>
                </div>
              </div>
              <div className="multi-list">
                {multiResult.items.map((item) => (
                  <div className="multi-row" key={item.code}>
                    <span className="code-mono multi-row-code">{item.code}</span>
                    <div className="multi-row-matches">
                      {item.matches.length === 0 ? (
                        <Badge tone="danger" dot>
                          {t('search.multiNotFound')}
                        </Badge>
                      ) : (
                        item.matches.map((match) => (
                          <Link
                            key={match.distributorId}
                            to={`/distributors/${match.distributorId}`}
                            className="multi-match"
                          >
                            <Badge tone="accent" dot>
                              {match.distributorName}
                            </Badge>
                            {match.archived ? (
                              <Badge tone="muted">{t('search.archived')}</Badge>
                            ) : null}
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )
      ) : !needle ? (
        <EmptyState
          icon={<Search size={30} />}
          title={t('search.emptyTitle')}
          text={t('search.emptyText')}
          action={
            <button type="button" className="btn btn-secondary" onClick={() => setCameraOpen(true)}>
              <ScanBarcode size={17} />
              {t('search.scan')}
            </button>
          }
        />
      ) : resultCount === 0 ? (
        <EmptyState
          icon={<Search size={28} />}
          title={t('search.noResults')}
          text={t('search.noResultsHint')}
          action={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setQuery('')
                setFilter('all')
              }}
            >
              {t('common.clear')}
            </button>
          }
        />
      ) : (
        <>
          <div className="search-summary">
            <span>{t('search.results', { count: formatNumber(resultCount, lang) })}</span>
            {showParcels && codeMatches.length > visibleCodes.length ? (
              <span>
                {t('common.showing', {
                  shown: formatNumber(visibleCodes.length, lang),
                  total: formatNumber(codeMatches.length, lang),
                })}
              </span>
            ) : null}
          </div>

          {visibleDistributors.length ? (
            <section className="card search-section">
              <div className="card-head">
                <div className="codes-heading">
                  <h2>{t('search.distributors')}</h2>
                  <Badge tone="neutral">{visibleDistributors.length}</Badge>
                </div>
              </div>
              <div className="search-dist-list">
                {visibleDistributors.map((distributor) => {
                  const stats = statsById.get(distributor.id)
                  return (
                    <Link
                      to={`/distributors/${distributor.id}`}
                      className="search-dist"
                      key={distributor.id}
                    >
                      <Avatar name={distributor.name} id={distributor.id} size="md" />
                      <div className="search-dist-copy">
                        <span className="search-dist-name">
                          <Highlight text={distributor.name} needle={needle} />
                          {distributor.archived ? (
                            <Badge tone="muted">{t('search.archived')}</Badge>
                          ) : null}
                        </span>
                        <span className="search-dist-meta">
                          {stats
                            ? `${formatNumber(stats.parcels, lang)} ${t('common.parcels')} · ${formatNumber(stats.sessions, lang)} ${t('common.sessions')}`
                            : t('dist.noScan')}
                          {distributor.note ? ` · ${distributor.note}` : ''}
                        </span>
                      </div>
                      <ChevronRight size={17} className="flip-rtl" />
                    </Link>
                  )
                })}
              </div>
            </section>
          ) : null}

          {visibleCodes.length ? (
            <section className="card search-section">
              <div className="card-head">
                <div className="codes-heading">
                  <h2>{t('search.parcels')}</h2>
                  <Badge tone="accent">{visibleCodes.length}</Badge>
                </div>
              </div>
              <div className="search-code-list">
                {visibleCodes.map((code) => {
                  const sendit = isSendit(code.code, prefixes)
                  const distributorName = distributorNames.get(code.distributorId) ?? ''
                  return (
                    <div className="search-code" key={code.id}>
                      <span className="search-code-icon">
                        <Package size={16} />
                      </span>
                      <div className="search-code-copy">
                        <span className="code-mono search-code-value">
                          <Highlight text={code.code} needle={needle} />
                        </span>
                        <span className="search-code-meta">
                          <Link to={`/distributors/${code.distributorId}`}>
                            <Highlight text={distributorName} needle={needle} />
                          </Link>
                          <span className="dot-sep">·</span>
                          {formatDate(code.scannedAt, lang)}
                          <span className="dot-sep">·</span>
                          {formatTime(code.scannedAt, lang)}
                          <span className="dot-sep">·</span>
                          {relativeTime(code.scannedAt, lang)}
                        </span>
                      </div>
                      <Badge tone={sendit ? 'accent' : 'neutral'}>
                        {sendit ? t('common.sendit') : t('common.standard')}
                      </Badge>
                      <div className="search-code-actions">
                        <button
                          type="button"
                          className="icon-btn icon-btn-sm"
                          onClick={() => void copy(code.code)}
                          aria-label={t('common.copy')}
                          title={t('common.copy')}
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-sm"
                          onClick={() => addToSession(code.code)}
                          disabled={!activeSession}
                          aria-label={t('search.inSession')}
                          title={activeSession ? t('search.inSession') : t('search.noActiveSession')}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}
        </>
      )}

      <ScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        mode="search"
        onDetect={(code) => {
          if (mode === 'multi') {
            // Keep the camera open: each scan appends to the paste list.
            setBlob((previous) => (previous ? `${previous}\n${code}` : code))
            setMultiCodes((previous) => (previous.length ? [...previous, code.toUpperCase()] : previous))
          } else {
            setQuery(code)
            setCameraOpen(false)
          }
        }}
      />
    </div>
  )
}
