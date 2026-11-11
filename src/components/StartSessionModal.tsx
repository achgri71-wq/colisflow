import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, ScanBarcode } from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore, useActiveSession } from '../store/useStore'
import { Modal } from './Modal'
import { Avatar } from './ui'
import { cx, relativeTime } from '../lib/utils'

export function StartSessionModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const startSession = useStore((state) => state.startSession)
  const distributors = useStore((state) => state.distributors)
  const activeSession = useActiveSession()

  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setName('')
      setError(null)
    }
  }, [open])

  const recent = useMemo(
    () =>
      distributors
        .filter((distributor) => !distributor.archived)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6),
    [distributors],
  )

  const submit = () => {
    const clean = name.trim()
    if (!clean) {
      setError(t('dialog.required'))
      return
    }
    const session = startSession(clean, 'manual')
    if (!session) {
      setError(t('dialog.required'))
      return
    }
    onClose()
    navigate('/scan')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('scan.new')}
      subtitle={t('scan.newText')}
      icon={<ScanBarcode size={20} />}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            <Play size={16} />
            {t('scan.start')}
          </button>
        </>
      }
    >
      <form
        className="start-session"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="new-session-name">
            {t('scan.distributor')}
          </label>
          <input
            id="new-session-name"
            className={cx('input', error && 'input-error')}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (error) setError(null)
            }}
            placeholder={t('dist.namePlaceholder')}
            autoFocus
            autoComplete="off"
          />
          {error ? <div className="field-error">{error}</div> : null}
        </div>

        {activeSession && activeSession.distributorName.toLowerCase() !== name.trim().toLowerCase() ? (
          <div className="inline-alert inline-alert-warning">{t('scan.willEndActive')}</div>
        ) : null}

        {recent.length ? (
          <div className="recent-block">
            <div className="field-label">{t('dashboard.recent')}</div>
            <div className="recent-list">
              {recent.map((distributor) => (
                <button
                  type="button"
                  key={distributor.id}
                  className={cx(
                    'recent-chip',
                    name.trim().toLowerCase() === distributor.name.toLowerCase() && 'is-selected',
                  )}
                  onClick={() => {
                    setName(distributor.name)
                    if (error) setError(null)
                  }}
                >
                  <Avatar name={distributor.name} id={distributor.id} size="sm" />
                  <span className="recent-chip-name">{distributor.name}</span>
                  <span className="recent-chip-meta">
                    {relativeTime(distributor.updatedAt, lang)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  )
}
