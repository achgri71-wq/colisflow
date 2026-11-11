import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Barcode,
  Camera,
  Check,
  CircleCheck,
  Copy,
  FileSpreadsheet,
  Keyboard,
  Package,
  Play,
  Plus,
  ScanBarcode,
  Trash,
  X,
} from 'lucide-react'
import type { CodeSource } from '../types'
import type { TranslationKey } from '../i18n/dict'
import { useI18n } from '../i18n'
import { useStore, useActiveSession } from '../store/useStore'
import { useDialog } from '../components/Dialog'
import { useToast } from '../components/Toast'
import { useHidScanner } from '../hooks/useHidScanner'
import { useNow } from '../hooks/useNow'
import { ScannerModal } from '../components/ScannerModal'
import { ImportCodesModal, ManualEntryModal } from '../components/ScanModals'
import { StartSessionModal } from '../components/StartSessionModal'
import { PageHeader, SearchField, EmptyState, Badge, Avatar } from '../components/ui'
import { isSendit } from '../lib/codes'
import {
  copyText,
  cx,
  formatNumber,
  formatTime,
  playTone,
  relativeTime,
  secondsToClock,
  vibrate,
} from '../lib/utils'

const SOURCE_ICONS = {
  camera: Camera,
  manual: Keyboard,
  hid: Barcode,
  import: FileSpreadsheet,
} satisfies Record<CodeSource, typeof Camera>

const SOURCE_KEYS: Record<CodeSource, TranslationKey> = {
  camera: 'source.camera',
  manual: 'source.manual',
  hid: 'source.hid',
  import: 'source.import',
}

type Filter = 'all' | 'sendit' | 'standard'

interface LastScan {
  code: string
  at: string
  moved: boolean
}

export function ScanPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const dialog = useDialog()
  const toast = useToast()

  const activeSession = useActiveSession()
  const sessionCodes = useStore((state) => state.codes)
  const distributors = useStore((state) => state.distributors)
  const prefixes = useStore((state) => state.settings.senditPrefixes)
  const addCode = useStore((state) => state.addCode)
  const addCodes = useStore((state) => state.addCodes)
  const deleteCode = useStore((state) => state.deleteCode)
  const restoreCode = useStore((state) => state.restoreCode)
  const finishSession = useStore((state) => state.finishSession)
  const cancelSession = useStore((state) => state.cancelSession)
  const restoreSession = useStore((state) => state.restoreSession)
  const startSession = useStore((state) => state.startSession)

  const now = useNow(Boolean(activeSession))

  const [cameraOpen, setCameraOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [startOpen, setStartOpen] = useState(false)
  const [lastScan, setLastScan] = useState<LastScan | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [visible, setVisible] = useState(120)

  const codes = useMemo(
    () =>
      activeSession
        ? sessionCodes
            .filter((code) => code.sessionId === activeSession.id)
            .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
        : [],
    [sessionCodes, activeSession],
  )

  useEffect(() => {
    setVisible(120)
  }, [query, filter, activeSession?.id])

  const allCount = codes.length
  const senditCount = codes.filter((code) => isSendit(code.code, prefixes)).length
  const standardCount = allCount - senditCount

  const filtered = codes.filter((code) => {
    if (filter === 'sendit' && !isSendit(code.code, prefixes)) return false
    if (filter === 'standard' && isSendit(code.code, prefixes)) return false
    if (query.trim()) {
      const needle = query.trim().toLowerCase()
      if (!code.code.toLowerCase().includes(needle)) return false
    }
    return true
  })

  const elapsed = activeSession
    ? secondsToClock((now - new Date(activeSession.startedAt).getTime()) / 1000)
    : ''

  const recentlyUsed = useMemo(() => {
    const counts = new Map<string, { count: number; last?: string }>()
    for (const code of sessionCodes) {
      const entry = counts.get(code.distributorId) ?? { count: 0 }
      entry.count += 1
      if (!entry.last || code.scannedAt > entry.last) entry.last = code.scannedAt
      counts.set(code.distributorId, entry)
    }
    return distributors
      .filter((distributor) => !distributor.archived)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8)
      .map((distributor) => ({ distributor, ...(counts.get(distributor.id) ?? { count: 0 }) }))
  }, [distributors, sessionCodes])

  const feedback = (tone: 'success' | 'warning' | 'move' | 'error') => {
    const settings = useStore.getState().settings
    if (settings.sound) playTone(tone)
    if (settings.haptics) vibrate(tone === 'warning' ? [18, 40, 18] : [12, 26, 12])
  }

  const handleScan = (raw: string, source: CodeSource = 'manual') => {
    // Run store updates asynchronously to avoid blocking UI thread
    setTimeout(() => {
      const result = addCode(raw, source)
      if (result.status === 'added' && result.code) {
        setLastScan({ code: result.code, at: new Date().toISOString(), moved: false })
        feedback('success')
        return
      }
      if (result.status === 'moved' && result.code) {
        setLastScan({ code: result.code, at: new Date().toISOString(), moved: true })
        feedback('move')
        toast.push({
          title: t('scan.moved', { name: result.movedFrom?.distributorName ?? '' }),
          message: result.code,
          tone: 'info',
          duration: 4200,
        })
        return
      }
      if (result.status === 'duplicate' && result.code) {
        setLastScan({ code: result.code, at: new Date().toISOString(), moved: false })
        feedback('warning')
        toast.push({ title: t('scan.duplicate'), message: result.code, tone: 'warning', duration: 2800 })
        return
      }
      if (result.status === 'invalid') {
        feedback('error')
        toast.push({ title: t('scan.manualEmpty'), tone: 'error', duration: 2600 })
      }
    }, 0)
  }

  useHidScanner((raw) => handleScan(raw, 'hid'), Boolean(activeSession))

  const handleBulk = (incoming: string[], source: CodeSource) => {
    const result = addCodes(incoming, source)
    const last = result.newCodes[result.newCodes.length - 1]
    if (last) setLastScan({ code: last.code, at: last.scannedAt, moved: result.moved > 0 })

    if (result.added === 0 && result.moved === 0) {
      feedback('warning')
      toast.push({
        title: t('scan.duplicate'),
        message: t('scan.bulkSummary', {
          added: 0,
          duplicates: result.duplicates,
          moved: 0,
        }),
        tone: 'warning',
      })
      return
    }

    feedback('success')
    toast.push({
      title: t('scan.bulkAdded', { count: result.added }),
      message: t('scan.bulkSummary', {
        added: result.added,
        duplicates: result.duplicates,
        moved: result.moved,
      }),
      tone: 'success',
      duration: 5200,
    })
  }

  const removeCode = async (id: string) => {
    if (!activeSession) return
    const target = codes.find((code) => code.id === id)
    if (!target) return
    const confirmed = await dialog.confirm({
      title: t('dist.deleteCodeTitle'),
      message: t('dist.deleteCodeMsg', {
        code: target.code,
        name: activeSession.distributorName,
      }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!confirmed) return
    const removed = deleteCode(id)
    feedback('warning')
    if (removed) {
      toast.push({
        message: t('dist.codeDeleted'),
        tone: 'warning',
        action: { label: t('scan.undo'), onClick: () => restoreCode(removed) },
      })
    }
  }

  const copyCode = async (code: string) => {
    const ok = await copyText(code)
    if (ok) toast.push({ title: t('common.copied'), message: code, tone: 'info', duration: 1600 })
  }

  const finish = async () => {
    if (!activeSession) return
    if (allCount === 0) {
      toast.push({ message: t('scan.finishEmpty'), tone: 'warning' })
      return
    }
    const confirmed = await dialog.confirm({
      title: t('scan.finishTitle'),
      message: t('scan.finishMsg', {
        count: formatNumber(allCount, lang),
        name: activeSession.distributorName,
      }),
      confirmLabel: t('scan.finish'),
      tone: 'primary',
    })
    if (!confirmed) return
    const distributorId = activeSession.distributorId
    const done = await finishSession()
    if (!done) return
    feedback('success')
    toast.push({
      title: t('scan.saved', { count: formatNumber(allCount, lang) }),
      tone: 'success',
    })
    navigate(`/distributors/${distributorId}`)
  }

  const cancel = async () => {
    if (!activeSession) return
    const confirmed = await dialog.confirm({
      title: t('scan.cancelTitle'),
      message: t('scan.cancelMsg', { count: formatNumber(allCount, lang) }),
      confirmLabel: t('scan.cancel'),
      tone: 'danger',
    })
    if (!confirmed) return
    const snapshot = await cancelSession()
    if (!snapshot) return
    feedback('warning')
    toast.push({
      title: t('scan.discarded'),
      tone: 'warning',
      duration: 8000,
      action: {
        label: t('scan.undo'),
        onClick: () => {
          restoreSession(snapshot)
          toast.push({ title: t('dist.restored'), tone: 'success' })
        },
      },
    })
  }

  return (
    <div className="page scan-page">
      <PageHeader
        title={t('scan.title')}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => setStartOpen(true)}>
            <Plus size={17} />
            {t('scan.new')}
          </button>
        }
      />

      {!activeSession ? (
        <>
          <section className="start-panel">
            <div className="start-panel-copy">
              <div className="start-icon">
                <ScanBarcode size={30} />
              </div>
              <div>
                <h2>{t('scan.new')}</h2>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => setStartOpen(true)}
              >
                <Play size={18} />
                {t('scan.start')}
              </button>
            </div>
            <div className="start-panel-recent">
              <div className="section-label">{t('scan.recent')}</div>
              {recentlyUsed.length ? (
                <div className="recent-dist-grid">
                  {recentlyUsed.map(({ distributor, count, last }) => (
                    <button
                      type="button"
                      key={distributor.id}
                      className="recent-dist"
                      onClick={() => {
                        startSession(distributor.name, 'manual')
                        feedback('success')
                      }}
                    >
                      <Avatar name={distributor.name} id={distributor.id} size="md" />
                      <span className="recent-dist-copy">
                        <strong>{distributor.name}</strong>
                        <span>
                          {count} {count === 1 ? t('common.parcel') : t('common.parcels')}
                          {last ? ` · ${relativeTime(last, lang)}` : ''}
                        </span>
                      </span>
                      <ArrowRight size={16} className="flip-rtl recent-dist-arrow" />
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState compact icon={<Package size={22} />} title={t('scan.noRecent')} />
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="session-hero">
            <div className="session-hero-main">
              <span className="live-badge">
                <span className="pulse-dot" />
                {t('scan.activeSession')}
              </span>
              <h2>{activeSession.distributorName}</h2>
              <p className="session-sub">
                {t('scan.startedAt', { time: formatTime(activeSession.startedAt, lang) })}
                <span className="dot-sep">·</span>
                {t('scan.duration')} <span className="mono">{elapsed}</span>
              </p>
              <div className="session-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void finish()}
                  disabled={allCount === 0}
                >
                  <CircleCheck size={17} />
                  {t('scan.finish')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void cancel()}>
                  <X size={16} />
                  {t('scan.cancel')}
                </button>
              </div>
            </div>
            <div className="session-numbers">
              <div className="session-number">
                <strong>{formatNumber(allCount, lang)}</strong>
                <span>{t('scan.scanned')}</span>
              </div>
              <div className="session-number">
                <strong>{formatNumber(senditCount, lang)}</strong>
                <span>{t('common.sendit')}</span>
              </div>
            </div>
          </section>

          <section className="scan-methods">
            <button
              type="button"
              className="scan-method scan-method-primary"
              onClick={() => setCameraOpen(true)}
            >
              <span className="scan-method-icon"><Camera size={22} /></span>
              <span className="scan-method-copy">
                <strong>{t('scan.camera')}</strong>
              </span>
              <ArrowRight size={17} className="scan-method-arrow flip-rtl" />
            </button>
            <button type="button" className="scan-method" onClick={() => setManualOpen(true)}>
              <span className="scan-method-icon"><Keyboard size={22} /></span>
              <span className="scan-method-copy">
                <strong>{t('scan.manual')}</strong>
              </span>
              <ArrowRight size={17} className="scan-method-arrow flip-rtl" />
            </button>
            <button type="button" className="scan-method" onClick={() => setImportOpen(true)}>
              <span className="scan-method-icon"><FileSpreadsheet size={22} /></span>
              <span className="scan-method-copy">
                <strong>{t('scan.import')}</strong>
              </span>
              <ArrowRight size={17} className="scan-method-arrow flip-rtl" />
            </button>
            <div className="scan-method scan-method-hid">
              <span className="scan-method-icon"><Barcode size={22} /></span>
              <span className="scan-method-copy">
                <strong>{t('scan.hid')}</strong>
              </span>
              <span className="hid-live">
                <span className="pulse-dot" />
              </span>
            </div>
          </section>

          {lastScan ? (
            <div
              className={cx('last-scan', lastScan.moved && 'is-moved')}
              key={`${lastScan.code}-${lastScan.at}`}
            >
              <span className="last-scan-icon">
                <Check size={18} />
              </span>
              <div className="last-scan-main">
                <span className="last-scan-label">{t('scan.last')}</span>
                <strong className="code-mono">{lastScan.code}</strong>
              </div>
              <Badge tone={isSendit(lastScan.code, prefixes) ? 'accent' : 'neutral'}>
                {isSendit(lastScan.code, prefixes) ? t('common.sendit') : t('common.standard')}
              </Badge>
              <span className="last-scan-time">{formatTime(lastScan.at, lang)}</span>
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                onClick={() => void copyCode(lastScan.code)}
                aria-label={t('common.copy')}
              >
                <Copy size={15} />
              </button>
            </div>
          ) : null}

          <section className="card codes-card">
            <div className="card-head">
              <div className="codes-heading">
                <h2>{t('scan.codes')}</h2>
                <Badge tone="accent">{formatNumber(allCount, lang)}</Badge>
              </div>
              <div className="codes-tools">
                <SearchField
                  value={query}
                  onChange={setQuery}
                  placeholder={t('scan.searchCodes')}
                />
              </div>
            </div>

            <div className="filter-row">
              {(
                [
                  { key: 'all', label: t('scan.filterAll'), count: allCount },
                  { key: 'sendit', label: t('scan.filterSendit'), count: senditCount },
                  { key: 'standard', label: t('scan.filterStandard'), count: standardCount },
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

            {filtered.length ? (
              <>
                <div className="code-list">
                  {filtered.slice(0, visible).map((code, index) => {
                    const sendit = isSendit(code.code, prefixes)
                    const SourceIcon = SOURCE_ICONS[code.source] ?? Keyboard
                    return (
                      <div className="code-row" key={code.id}>
                        <span className="code-index">{String(index + 1).padStart(2, '0')}</span>
                        <div className="code-main">
                          <span className="code-mono">{code.code}</span>
                          <span className="code-sub">
                            {formatTime(code.scannedAt, lang)}
                            <span className="dot-sep">·</span>
                            <SourceIcon size={12} />
                            {t(SOURCE_KEYS[code.source] ?? 'source.manual')}
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
                            onClick={() => void copyCode(code.code)}
                            aria-label={t('common.copy')}
                          >
                            <Copy size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn icon-btn-sm icon-btn-danger"
                            onClick={() => void removeCode(code.id)}
                            aria-label={t('common.delete')}
                          >
                            <Trash size={15} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {filtered.length > visible ? (
                  <div className="code-list-more">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setVisible((current) => current + 200)}
                    >
                      {t('common.loadMore')}
                      <span className="btn-count">
                        {Math.min(200, filtered.length - visible)}
                      </span>
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon={<Package size={26} />}
                title={t('scan.emptyCodes')}
                text={query || filter !== 'all' ? t('dist.emptyFilter') : t('scan.emptyCodesHint')}
                action={
                  !query && filter === 'all' ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setCameraOpen(true)}
                    >
                      <Camera size={16} />
                      {t('scan.camera')}
                    </button>
                  ) : null
                }
              />
            )}
          </section>
        </>
      )}

      <ScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDetect={(code) => handleScan(code, 'camera')}
      />
      <ManualEntryModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSubmit={(incoming) => handleBulk(incoming, 'manual')}
      />
      <ImportCodesModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(incoming) => handleBulk(incoming, 'import')}
      />
      <StartSessionModal open={startOpen} onClose={() => setStartOpen(false)} />
    </div>
  )
}
