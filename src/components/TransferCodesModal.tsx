import { useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, Package } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Distributor } from '../types'
import { useStore } from '../store/useStore'
import { useToast } from '../components/Toast'
import { Modal } from './Modal'
import { Badge, EmptyState, SearchField } from './ui'
import { FIXED_LISTS } from '../lib/fixedLists'
import { cx, formatDate, formatTime } from '../lib/utils'

/**
 * Moves selected parcels of a distributor into one of the permanent routeur
 * lists. Sources can be any distributor (including another fixed list), the
 * targets are always the fixed lists.
 */
export function TransferCodesModal({
  open,
  onClose,
  distributor,
}: {
  open: boolean
  onClose: () => void
  distributor: Distributor
}) {
  const { t, lang } = useI18n()
  const toast = useToast()
  const distributors = useStore((state) => state.distributors)
  const codes = useStore((state) => state.codes)
  const moveCodesToDistributor = useStore((state) => state.moveCodesToDistributor)

  const byName = useMemo(
    () => new Map(distributors.map((item) => [item.name.trim().toLowerCase(), item])),
    [distributors],
  )
  const targets = useMemo(
    () =>
      FIXED_LISTS.map((list) => byName.get(list.name.toLowerCase())).filter(
        (item): item is Distributor => Boolean(item) && item!.id !== distributor.id,
      ),
    [byName, distributor.id],
  )

  const [targetId, setTargetId] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(new Set())
  }, [open])

  const activeTarget =
    targets.find((target) => target.id === targetId)?.id ?? targets[0]?.id ?? ''

  const list = useMemo(
    () =>
      codes
        .filter((code) => code.distributorId === distributor.id)
        .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)),
    [codes, distributor.id],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return list
    return list.filter((code) => code.code.toLowerCase().includes(needle))
  }, [list, query])

  const allSelected = filtered.length > 0 && filtered.every((code) => selected.has(code.id))

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((current) => {
      const next = new Set(current)
      if (allSelected) filtered.forEach((code) => next.delete(code.id))
      else filtered.forEach((code) => next.add(code.id))
      return next
    })
  }

  const submit = () => {
    if (!activeTarget || !selected.size) return
    const target = distributors.find((item) => item.id === activeTarget)
    const result = moveCodesToDistributor(Array.from(selected), activeTarget)
    onClose()
    if (result.moved > 0) {
      toast.push({
        message: t('transfer.done', { count: result.moved, name: target?.name ?? '' }),
        tone: 'success',
      })
    } else {
      toast.push({ message: t('transfer.empty'), tone: 'info' })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('transfer.title')}
      subtitle={t('transfer.subtitle', { name: distributor.name })}
      icon={<ArrowRightLeft size={20} />}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={!activeTarget || selected.size === 0}
          >
            <ArrowRightLeft size={16} />
            {t('transfer.confirm', { count: selected.size })}
          </button>
        </>
      }
    >
      {targets.length === 0 ? (
        <EmptyState compact icon={<ArrowRightLeft size={24} />} title={t('transfer.noTarget')} />
      ) : (
        <div className="transfer-body">
          <div className="field">
            <label className="field-label" htmlFor="transfer-target">
              {t('transfer.target')}
            </label>
            <select
              id="transfer-target"
              className="input"
              value={activeTarget}
              onChange={(event) => setTargetId(event.target.value)}
            >
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
          </div>

          <div className="transfer-toolbar">
            <SearchField value={query} onChange={setQuery} placeholder={t('dist.filterCodes')} />
            <label className="transfer-selectall">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              {t('transfer.selectAll')}
            </label>
            <Badge tone="accent">{t('transfer.selected', { count: selected.size })}</Badge>
          </div>

          {filtered.length ? (
            <div className="transfer-list">
              {filtered.map((code) => {
                const checked = selected.has(code.id)
                return (
                  <label key={code.id} className={cx('transfer-row', checked && 'is-selected')}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(code.id)}
                    />
                    <span className="code-mono">{code.code}</span>
                    <span className="transfer-date">
                      {formatDate(code.scannedAt, lang)} · {formatTime(code.scannedAt, lang)}
                    </span>
                  </label>
                )
              })}
            </div>
          ) : (
            <EmptyState compact icon={<Package size={24} />} title={t('dist.codesEmpty')} />
          )}
        </div>
      )}
    </Modal>
  )
}
