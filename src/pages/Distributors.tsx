import { useMemo, useState } from 'react'
import { Boxes, Plus, Search, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore } from '../store/useStore'
import { PageHeader, SearchField, EmptyState } from '../components/ui'
import { DistributorCard } from '../components/DistributorCard'
import { StartSessionModal } from '../components/StartSessionModal'
import { useDistributorActions } from '../hooks/useDistributorActions'
import { distributorStats } from '../lib/stats'
import { cx } from '../lib/utils'

type Filter = 'all' | 'active' | 'archived'

export function DistributorsPage() {
  const { t } = useI18n()
  const distributors = useStore((state) => state.distributors)
  const sessions = useStore((state) => state.sessions)
  const codes = useStore((state) => state.codes)
  const prefixes = useStore((state) => state.settings.senditPrefixes)
  const actions = useDistributorActions()

  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [startOpen, setStartOpen] = useState(false)

  const statsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof distributorStats>>()
    for (const distributor of distributors) {
      map.set(distributor.id, distributorStats(codes, sessions, distributor.id, prefixes))
    }
    return map
  }, [distributors, codes, sessions, prefixes])

  const activeCount = distributors.filter((distributor) => !distributor.archived).length
  const archivedCount = distributors.length - activeCount

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
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
        if (a.archived !== b.archived) return a.archived ? 1 : -1
        return b.updatedAt.localeCompare(a.updatedAt)
      })
  }, [distributors, filter, query])

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: t('dist.filterAll'), count: distributors.length },
    { key: 'active', label: t('dist.filterActive'), count: activeCount },
    { key: 'archived', label: t('dist.filterArchived'), count: archivedCount },
  ]

  return (
    <div className="page distributors-page">
      <PageHeader
        title={t('dist.title')}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setStartOpen(true)}>
            <Plus size={17} />
            {t('dist.new')}
          </button>
        }
      />

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
            <div className="toolbar-search">
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder={t('dist.search')}
              />
            </div>
          </div>

          {filtered.length ? (
            <div className="dist-grid">
              {filtered.map((distributor) => (
                <DistributorCard
                  key={distributor.id}
                  distributor={distributor}
                  stats={
                    statsById.get(distributor.id) ?? {
                      parcels: 0,
                      sendit: 0,
                      sessions: 0,
                    }
                  }
                  onResume={() => void actions.resume(distributor)}
                  onExport={() => void actions.exportExcel(distributor)}
                  onRename={() => void actions.rename(distributor)}
                  onArchive={() => void actions.archive(distributor)}
                  onRestore={() => void actions.restore(distributor)}
                  onDelete={() => void actions.remove(distributor)}
                />
              ))}
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
                    setFilter('all')
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
    </div>
  )
}
