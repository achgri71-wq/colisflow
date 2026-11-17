import { useMemo, useState } from 'react'
import { Archive, Boxes, ChevronDown, Cloud, CloudDownload, ListChecks, Plus, RefreshCw, Search, Truck, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore } from '../store/useStore'
import { PageHeader, SearchField, EmptyState, Badge } from '../components/ui'
import { DistributorCard } from '../components/DistributorCard'
import { ColisScannerModal } from '../components/ColisScannerModal'
import { StartSessionModal } from '../components/StartSessionModal'
import { SyncActivity } from '../components/SyncActivity'
import { useDistributorActions } from '../hooks/useDistributorActions'
import { distributorStats } from '../lib/stats'
import { buildFlowPayload } from '../lib/colisScanner'
import { putCloudLinkSlot } from '../lib/cloudLink'
import { cx } from '../lib/utils'
import type { Distributor } from '../types'
import { useToast } from '../components/Toast'

type Filter = 'all' | 'active' | 'archived'

export function DistributorsPage() {
  const { t } = useI18n()
  const toast = useToast()
  const distributors = useStore((state) => state.distributors)
  const sessions = useStore((state) => state.sessions)
  const codes = useStore((state) => state.codes)
  const prefixes = useStore((state) => state.settings.senditPrefixes)
  const actions = useDistributorActions()

  // The active lists are what the operator works with day to day, so the page
  // opens on "Actifs" instead of the full (archived included) list.
  const [filter, setFilter] = useState<Filter>('active')
  const [query, setQuery] = useState('')
  const [startOpen, setStartOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [fixedOpen, setFixedOpen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [publishingCloud, setPublishingCloud] = useState(false)

  const publishToRsp = async () => {
    if (publishingCloud) return
    setPublishingCloud(true)
    try {
      const snapshot = buildFlowPayload(distributors, codes)
      await putCloudLinkSlot('flow', snapshot)
      const codeCount = snapshot.distributors.reduce((sum, item) => sum + item.codes.length, 0)
      toast.push({
        message: t('dist.cloudPublished', { lists: snapshot.distributors.length, codes: codeCount }),
        tone: 'success',
      })
    } catch (error) {
      console.warn('Manual ColisFlow → RSP cloud publish failed:', error)
      toast.push({ message: t('dist.cloudPublishFailed'), tone: 'error' })
    } finally {
      setPublishingCloud(false)
    }
  }

  const statsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof distributorStats>>()
    for (const distributor of distributors) {
      map.set(distributor.id, distributorStats(codes, sessions, distributor.id, prefixes))
    }
    return map
  }, [distributors, codes, sessions, prefixes])

  const activeCount = distributors.filter((distributor) => !distributor.archived).length
  const archivedCount = distributors.length - activeCount
  const needle = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    return distributors
      .filter((distributor) => {
        if (filter === 'active' && distributor.archived) return false
        if (filter === 'archived' && !distributor.archived) return false
        if (!needle) return true
        return (
          distributor.name.toLowerCase().includes(needle) ||
          (distributor.note ?? '').toLowerCase().includes(needle) ||
          (distributor.phone ?? '').toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => {
        if (Boolean(a.fixed) !== Boolean(b.fixed)) return a.fixed ? -1 : 1
        if (a.archived !== b.archived) return a.archived ? 1 : -1
        return b.updatedAt.localeCompare(a.updatedAt)
      })
  }, [distributors, filter, needle])

  // The fixed routeur lists stay tucked away until the operator opens them, so
  // the ordinary distributors are what they see first. A live search opens the
  // section automatically, otherwise the matches would look hidden.
  const fixedList = filtered.filter((distributor) => distributor.fixed)
  const others = filtered.filter((distributor) => !distributor.fixed)
  const showFixed = fixedOpen || (needle.length > 0 && fixedList.length > 0)

  // Only ordinary, still active lists can be bulk-archived. The six fixed
  // routeur lists and the already archived distributors are left out.
  const selectableList = filtered.filter((distributor) => !distributor.fixed && !distributor.archived)
  const allSelected =
    selectableList.length > 0 && selectableList.every((distributor) => selected.has(distributor.id))

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitSelect = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableList.map((distributor) => distributor.id)))
  }

  const archiveSelected = async () => {
    const targets = distributors.filter((distributor) => selected.has(distributor.id))
    const ok = await actions.archiveMany(targets)
    if (ok) exitSelect()
  }

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: t('dist.filterAll'), count: distributors.length },
    { key: 'active', label: t('dist.filterActive'), count: activeCount },
    { key: 'archived', label: t('dist.filterArchived'), count: archivedCount },
  ]

  const renderGrid = (items: Distributor[]) => (
    <div className={cx('dist-grid', selecting && 'is-selecting')}>
      {items.map((distributor) => (
        <DistributorCard
          key={distributor.id}
          distributor={distributor}
          stats={statsById.get(distributor.id) ?? { parcels: 0, sendit: 0, sessions: 0 }}
          selectable={selecting}
          selected={selected.has(distributor.id)}
          onToggleSelect={() => toggleSelect(distributor.id)}
          onResume={() => void actions.resume(distributor)}
          onExport={() => void actions.exportExcel(distributor)}
          onRename={() => void actions.rename(distributor)}
          onArchive={() => void actions.archive(distributor)}
          onRestore={() => void actions.restore(distributor)}
          onDelete={() => void actions.remove(distributor)}
        />
      ))}
    </div>
  )

  return (
    <div className="page distributors-page">
      <PageHeader
        title={t('dist.title')}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void publishToRsp()}
              disabled={publishingCloud}
            >
              {publishingCloud ? <RefreshCw size={16} className="spin" /> : <Cloud size={16} />}
              {publishingCloud ? t('dist.cloudSyncing') : t('dist.cloudSync')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setScanOpen(true)}>
              <CloudDownload size={16} />
              {t('scanlink.title')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStartOpen(true)}>
              <Plus size={17} />
              {t('dist.new')}
            </button>
          </>
        }
      />

      <SyncActivity />

      {distributors.length === 0 ? (
        <EmptyState
          icon={<Boxes size={30} />}
          title={t('dist.empty')}
          text={t('dist.emptyText')}
          action={
            <button type="button" className="btn btn-primary" onClick={() => setStartOpen(true)}>
              <Plus size={17} />
              {t('dist.new')}
            </button>
          }
        />
      ) : (
        <>
          <div className="list-toolbar">
            <div className="filter-row">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={cx('chip', filter === tab.key && 'is-active')}
                  onClick={() => setFilter(tab.key)}
                >
                  {tab.label}
                  <span className="chip-count">{tab.count}</span>
                </button>
              ))}
            </div>
            <div className="toolbar-tools">
              <div className="toolbar-search">
                <SearchField
                  value={query}
                  onChange={setQuery}
                  placeholder={t('dist.search')}
                />
              </div>
              {!selecting && selectableList.length ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelecting(true)}
                >
                  <ListChecks size={15} />
                  {t('dist.select')}
                </button>
              ) : null}
            </div>
          </div>

          {selecting ? (
            <div className="dist-bulk">
              <div className="dist-bulk-info">
                <Badge tone="accent">{t('dist.selectedCount', { count: selected.size })}</Badge>
                <span className="dist-bulk-hint">{t('dist.selectHint')}</span>
              </div>
              <div className="dist-bulk-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={toggleAll}>
                  {allSelected ? t('dist.selectNone') : t('dist.selectAll')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void archiveSelected()}
                  disabled={selected.size === 0}
                >
                  <Archive size={15} />
                  {t('dist.archiveSelected')}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={exitSelect}>
                  {t('dist.selectExit')}
                </button>
              </div>
            </div>
          ) : null}

          {filtered.length ? (
            <div className="dist-sections">
              {fixedList.length ? (
                <section className="dist-section">
                  <button
                    type="button"
                    className={cx('dist-section-head', showFixed && 'is-open')}
                    onClick={() => setFixedOpen((value) => !value)}
                    aria-expanded={showFixed}
                  >
                    <span className="dist-section-icon">
                      <Truck size={17} />
                    </span>
                    <span className="dist-section-title">
                      {t('dist.fixedSection')}
                      <small>{t('dist.fixedSectionHint')}</small>
                    </span>
                    <Badge tone="accent">{fixedList.length}</Badge>
                    <ChevronDown size={18} className={cx('dist-section-chevron', showFixed && 'is-open')} />
                  </button>
                  {showFixed ? renderGrid(fixedList) : null}
                </section>
              ) : null}

              {others.length ? (
                <section className="dist-section">
                  {fixedList.length ? (
                    <div className="section-label dist-section-label">{t('dist.otherSection')}</div>
                  ) : null}
                  {renderGrid(others)}
                </section>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={<Search size={28} />}
              title={t('dist.emptyFilter')}
              action={
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setQuery('')
                    setFilter('active')
                  }}
                >
                  <X size={15} />
                  {t('common.clear')}
                </button>
              }
            />
          )}
        </>
      )}

      <StartSessionModal open={startOpen} onClose={() => setStartOpen(false)} />
      <ColisScannerModal open={scanOpen} onClose={() => setScanOpen(false)} />
    </div>
  )
}
