import { useEffect, useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, Keyboard, ScanBarcode, Upload, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { parseCodeBlob, uniqueCodes } from '../lib/codes'
import { readCodesFromSpreadsheet } from '../lib/export'
import { cx } from '../lib/utils'
import { Modal } from './Modal'
import { Spinner } from './ui'

export function ManualEntryModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (codes: string[]) => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState('')

  useEffect(() => {
    if (!open) setText('')
  }, [open])

  const codes = useMemo(() => uniqueCodes(parseCodeBlob(text)), [text])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('scan.manualTitle')}
      subtitle={t('scan.manualText')}
      icon={<Keyboard size={20} />}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!codes.length}
            onClick={() => {
              onSubmit(codes)
              onClose()
            }}
          >
            <ScanBarcode size={17} />
            {t('scan.manualAdd')}
            {codes.length ? <span className="btn-count">{codes.length}</span> : null}
          </button>
        </>
      }
    >
      <div className="manual-entry">
        <textarea
          className="textarea input-mono"
          rows={8}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('scan.manualPlaceholder')}
          autoFocus
          spellCheck={false}
        />
        <div className="manual-meta">
          <span className={cx('manual-count', codes.length > 0 && 'has-codes')}>
            {codes.length
              ? t('scan.importFound', { count: codes.length })
              : t('scan.manualEmpty')}
          </span>
          {text ? (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setText('')}>
              <X size={14} />
              {t('common.clear')}
            </button>
          ) : null}
        </div>
        {codes.length ? (
          <div className="code-preview">
            {codes.slice(0, 12).map((code) => (
              <span className="code-pill" key={code}>
                {code}
              </span>
            ))}
            {codes.length > 12 ? (
              <span className="code-pill code-pill-more">+{codes.length - 12}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

export function ImportCodesModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean
  onClose: () => void
  onImport: (codes: string[]) => void
}) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) {
      setFileName('')
      setCodes([])
      setError(null)
      setLoading(false)
      setDragging(false)
    }
  }, [open])

  const loadFile = async (file: File) => {
    setLoading(true)
    setError(null)
    setFileName(file.name)
    try {
      const parsed = await readCodesFromSpreadsheet(file)
      setCodes(parsed.codes)
    } catch {
      setCodes([])
      setError(t('scan.importError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('scan.importTitle')}
      subtitle={t('scan.importText')}
      icon={<FileSpreadsheet size={20} />}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!codes.length || loading}
            onClick={() => {
              onImport(codes)
              onClose()
            }}
          >
            <Upload size={17} />
            {t('scan.importAdd', { count: codes.length })}
          </button>
        </>
      }
    >
      <div className="import-modal">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void loadFile(file)
            event.target.value = ''
          }}
        />

        <button
          type="button"
          className={cx('dropzone', dragging && 'is-dragging', fileName && 'has-file')}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files?.[0]
            if (file) void loadFile(file)
          }}
        >
          {loading ? (
            <Spinner size={26} label={t('scan.importing')} />
          ) : (
            <FileSpreadsheet size={30} strokeWidth={1.6} />
          )}
          <span className="dropzone-title">
            {loading ? t('scan.importing') : fileName || t('scan.importChoose')}
          </span>
          <span className="dropzone-hint">
            {fileName ? t('scan.importChange') : 'Excel (.xlsx) · CSV'}
          </span>
        </button>

        {error ? <div className="inline-alert inline-alert-danger">{error}</div> : null}

        {!error && codes.length ? (
          <div className="import-result">
            <div className="import-result-head">
              <strong>{t('scan.importFound', { count: codes.length })}</strong>
              <span className="import-result-label">{t('scan.importPreview')}</span>
            </div>
            <div className="code-preview">
              {codes.slice(0, 16).map((code) => (
                <span className="code-pill" key={code}>
                  {code}
                </span>
              ))}
              {codes.length > 16 ? (
                <span className="code-pill code-pill-more">+{codes.length - 16}</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
