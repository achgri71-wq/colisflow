import { useEffect, useState } from 'react'
import { CloudDownload, Download, Link2Off, RefreshCw } from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore } from '../store/useStore'
import { useToast } from './Toast'
import { Modal } from './Modal'
import { Badge, EmptyState, Spinner } from './ui'
import {
  fetchScanDistributors,
  getScannerAuth,
  scannerErrorKey,
  signInScanner,
  signOutScanner,
  type ScannerAuth,
} from '../lib/colisScanner'
import type { ScanDistributor } from '../types'
import { formatDate, formatNumber } from '../lib/utils'

/**
 * Asks the background sync to import right away. Lists are merged
 * automatically, and the run shows up in the sync activity card. On top of
 * that automatic sync the operator can also import a list, a selection, or
 * everything by hand.
 */
function requestSyncNow(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('colisflow:sync-now'))
}

export function ColisScannerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n()
  const importFromScanner = useStore((state) => state.importFromScanner)
  const logSync = useStore((state) => state.logSync)
  const toast = useToast()

  const [auth, setAuth] = useState<ScannerAuth | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ScanDistributor[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!open) {
      setSelected(new Set())
      return
    }
    setError(null)
    setAuth(getScannerAuth())
  }, [open])

  useEffect(() => {
    if (!open || !auth) return
    let cancelled = false
    setLoading(true)
    setItems([])
    fetchScanDistributors()
      .then((list) => {
        if (cancelled) return
        setItems(list)
        setSelected(new Set())
        setError(null)
        // Import as soon as the Colis Scanner lists are known.
        requestSyncNow()
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setAuth(null)
        setError(t(scannerErrorKey(cause)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, auth, reloadKey, t])

  const connect = async () => {
    if (!email.trim() || !password) return
    setConnecting(true)
    setError(null)
    try {
      const next = await signInScanner(email, password)
      setAuth(next)
      setPassword('')
      setReloadKey((key) => key + 1)
    } catch (cause) {
      setError(t(scannerErrorKey(cause)))
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = () => {
    signOutScanner()
    setItems([])
    setSelected(new Set())
    setAuth(null)
    setError(null)
  }

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const importable = items.filter((item) => item.codes.length)
  const allSelected = importable.length > 0 && importable.every((item) => selected.has(item.id))

  /**
   * Manual import: pushes the chosen Colis Scanner lists into ColisFlow right
   * away, on top of the automatic background sync. Only the lists the operator
   * ticked are brought to the top of the page; `touch: 'all'` is used when the
   * chosen lists are already the target (the selection, or a single row).
   */
  const runImport = async (list: ScanDistributor[], options?: { touch?: 'checked' | 'all' }) => {
    const chosen = list.filter((item) => item.codes.length)
    if (!chosen.length || importing) return
    setImporting(true)
    try {
      const touchNames =
        options?.touch === 'all'
          ? chosen.map((item) => item.name)
          : chosen.filter((item) => selected.has(item.id)).map((item) => item.name)
      const result = await importFromScanner(chosen, { touchNames })
      logSync({
        status: 'ok',
        lists: chosen.length,
        codes: chosen.reduce((sum, item) => sum + item.codes.length, 0),
        added: result.added,
        moved: result.moved,
        names: result.names,
        manual: true,
      })
      toast.push({
        title: t('scanlink.doneTitle'),
        message: t('scanlink.doneMsg', {
          created: formatNumber(result.created, lang),
          codes: formatNumber(result.added, lang),
          moved: formatNumber(result.moved, lang),
        }),
        tone: 'success',
        duration: 6500,
      })
      setSelected(new Set())
    } catch {
      toast.push({ title: t('scanlink.errImport'), tone: 'error' })
    } finally {
      setImporting(false)
    }
  }

  const connectDisabled = connecting || !email.trim() || !password

  return (
    <Modal open={open} onClose={onClose} title={t('scanlink.title')} size="md">
      {!auth ? (
        <div className="scan-connect">
          <p className="scan-hint">{t('scanlink.subtitle')}</p>
          <div className="field">
            <label className="field-label" htmlFor="scanlink-email">
              {t('scanlink.email')}
            </label>
            <input
              id="scanlink-email"
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="scanlink-password">
              {t('scanlink.password')}
            </label>
            <input
              id="scanlink-password"
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void connect()
                }
              }}
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="scan-error">{error}</p> : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void connect()}
            disabled={connectDisabled}
          >
            <CloudDownload size={15} />
            {connecting ? t('scanlink.connecting') : t('scanlink.connect')}
          </button>
        </div>
      ) : loading ? (
        <div className="scan-loading">
          <Spinner size={20} />
          {t('common.loading')}
        </div>
      ) : (
        <>
          <div className="scan-top">
            <Badge tone="accent" dot>
              {auth.email}
            </Badge>
            <div className="scan-top-actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setReloadKey((key) => key + 1)
                }}
                aria-label={t('scanlink.refresh')}
                title={t('scanlink.refresh')}
              >
                <RefreshCw size={15} />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={disconnect}
                aria-label={t('scanlink.disconnect')}
                title={t('scanlink.disconnect')}
              >
                <Link2Off size={15} />
              </button>
            </div>
          </div>

          <p className="scan-hint scan-hint-auto">{t('scanlink.autoHint')}</p>

          {error ? <p className="scan-error">{error}</p> : null}

          {items.length === 0 ? (
            <EmptyState compact title={t('scanlink.empty')} text={t('scanlink.emptyText')} />
          ) : (
            <>
              <div className="scan-toolbar">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void runImport(items)}
                  disabled={importing || !importable.length}
                >
                  {importing ? <Spinner size={15} /> : <CloudDownload size={15} />}
                  {importing ? t('scanlink.importing') : t('scanlink.importAll')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    void runImport(
                      items.filter((item) => selected.has(item.id)),
                      { touch: 'all' },
                    )
                  }
                  disabled={importing || selected.size === 0}
                >
                  <Download size={15} />
                  {t('scanlink.importSelected', { count: selected.size })}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() =>
                    setSelected(allSelected ? new Set() : new Set(importable.map((item) => item.id)))
                  }
                  disabled={importing || !importable.length}
                >
                  {allSelected ? t('dist.selectNone') : t('dist.selectAll')}
                </button>
              </div>

              <div className="scan-list">
                {items.map((item) => (
                  <div className="scan-row" key={item.id}>
                    <input
                      type="checkbox"
                      className="scan-row-check"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      aria-label={item.name}
                      disabled={!item.codes.length}
                    />
                    <div className="scan-row-copy">
                      <span className="scan-row-name">{item.name}</span>
                      <span className="scan-row-meta">
                        {formatNumber(item.codes.length, lang)} {t('common.parcels')}
                        {item.archived ? <Badge tone="muted">{t('scanlink.archived')}</Badge> : null}
                        {item.date ? ` · ${formatDate(item.date, lang)}` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs scan-row-import"
                      onClick={() => void runImport([item], { touch: 'all' })}
                      disabled={importing || !item.codes.length}
                    >
                      <Download size={13} />
                      {t('scanlink.import')}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
