import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Distributor, ScanCode } from '../types'
import { useStore } from '../store/useStore'
import { useToast } from './Toast'
import { Modal } from './Modal'

/**
 * Sets a parcel's entry date by hand.
 *
 * Colis Scanner keeps no date per code, so a code imported from it inherits the
 * moment its distributor list was last saved — usually today, even for a parcel
 * that has been stuck for weeks. This modal lets the operator correct that:
 * the date then drives the late count published to Return Scanner Pro.
 *
 * `code` null means "apply to every parcel of this distributor".
 */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Turns an ISO stamp into the `datetime-local` input format (local time). */
function toInputValue(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function CodeDateModal({
  open,
  onClose,
  distributor,
  code,
}: {
  open: boolean
  onClose: () => void
  distributor: Distributor
  code: ScanCode | null
}) {
  const { t } = useI18n()
  const toast = useToast()
  const setCodeDate = useStore((state) => state.setCodeDate)
  const setDistributorCodeDates = useStore((state) => state.setDistributorCodeDates)
  const total = useStore(
    (state) => state.codes.filter((item) => item.distributorId === distributor.id).length,
  )

  const [value, setValue] = useState('')

  useEffect(() => {
    if (!open) return
    setValue(toInputValue(code?.scannedAt ?? new Date().toISOString()))
  }, [open, code?.scannedAt])

  const save = () => {
    if (!value) {
      toast.push({ title: t('codedate.invalid'), tone: 'error' })
      return
    }
    const stamp = new Date(value).toISOString()
    if (Number.isNaN(Date.parse(stamp))) {
      toast.push({ title: t('codedate.invalid'), tone: 'error' })
      return
    }
    const count = code
      ? setCodeDate(code.id, stamp)
        ? 1
        : 0
      : setDistributorCodeDates(distributor.id, stamp)
    if (!count) {
      toast.push({ title: t('codedate.invalid'), tone: 'error' })
      return
    }
    toast.push({ title: t('codedate.saved', { count }), tone: 'success' })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('codedate.title')}
      subtitle={t('codedate.subtitle')}
      icon={<CalendarDays size={20} />}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="code-date-input">
          {t('codedate.date')}
        </label>
        <input
          id="code-date-input"
          className="input"
          type="datetime-local"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <small className="field-hint">
          {code
            ? t('codedate.scopeOne', { code: code.code })
            : t('codedate.scopeAll', { count: total, name: distributor.name })}
        </small>
      </div>
    </Modal>
  )
}
