import { useEffect, useState } from 'react'
import { CloudDownload, Link2Off, RefreshCw } from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore } from '../store/useStore'
import { useDialog } from './Dialog'
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

export function ColisScannerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n()
  const dialog = useDialog()
  const toast = useToast()
  const importFromScanner = useStore((state) => state.importFromScanner)

  const [auth, setAuth] = useState<ScannerAuth | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ScanDistributor[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!open) return
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
        setError(null)
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
    setAuth(null)
    setError(null)
  }

  const runImport = async (targets: ScanDistributor[]) => {
    const total = targets.reduce((sum, item) => sum + item.codes.length, 0)
    if (!targets.length || !total || busy) return

    const confirmed = await dialog.confirm({
      title: t('scanlink.confirmTitle'),
      message: t('scanlink.confirmMsg', {
        lists: formatNumber(targets.length, lang),
        codes: formatNumber(total, lang),
      }),
      confirmLabel: t('scanlink.import'),
      tone: 'primary',
    })
    if (!confirmed) return

    setBusy(targets.length === 1 ? targets[0].id : 'all')
    try {
      const result = await importFromScanner(targets)
      toast.push({
        title: t('scanlink.doneTitle'),
        message: t('scanlink.doneMsg', {
          created: formatNumber(result.created, lang),
          codes: formatNumber(result.added, lang),
          moved: formatNumber(result.moved, lang),
        }),
        tone: 'success',
        duration: 7000,
      })
    } catch {
      toast.push({ message: t('scanlink.errImport'), tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const connectDisabled = connecting || !email.trim() || !password

  const footer =
    !auth || loading || items.length === 0 ? undefined : (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void runImport(items)}
        disabled={busy !== null}
      >
        <CloudDownload size={15} />
        {busy === 'all' ? t('scanlink.importing') : t('scanlink.importAll')}
      </button>
    )

  return (
    <Modal open={open} onClose={onClose} title={t('scanlink.title')} size="md" footer={footer}>
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

          {error ? <p className="scan-error">{error}</p> : null}

          {items.length === 0 ? (
            <EmptyState compact title={t('scanlink.empty')} text={t('scanlink.emptyText')} />
          ) : (
            <div className="scan-list">
              {items.map((item) => (
                <div className="scan-row" key={item.id}>
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
                    className="btn btn-secondary btn-sm"
                    onClick={() => void runImport([item])}
                    disabled={busy !== null || item.codes.length === 0}
                  >
                    {busy === item.id ? t('scanlink.importing') : t('scanlink.import')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
