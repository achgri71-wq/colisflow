import { useMemo, useState } from 'react'
import { Archive } from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore } from '../store/useStore'
import { PageHeader, SearchField, EmptyState, Badge } from '../components/ui'
import { DistributorCard } from '../components/DistributorCard'
import { useDistributorActions } from '../hooks/useDistributorActions'
import { distributorStats } from '../lib/stats'
import { formatNumber } from '../lib/utils'

export function ArchivePage() {
  const { t, lang } = useI18n()
  const distributors = useStore((state) => state.distributors)
  const sessions = useStore((state) => state.sessions)
  const codes = useStore((state) => state.codes)
  const prefixes = useStore((state) => state.settings.senditPrefixes)
  const actions = useDistributorActions()
  const [query, setQuery] = useState('')

  const archived = distributors.filter((distributor) => distributor.archived)

  const statsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof distributorStats>>()
    for (const distributor of archived) {
      map.set(distributor.id, distributorStats(codes, sessions, distributor.id, prefixes))
    }
    return map
  }, [archived, codes, sessions, prefixes])

  const filtered = archived
    .filter((distributor) => {
      const needle = query.trim().toLowerCase()
      if (!needle) return true
      return (
        distributor.name.toLowerCase().includes(needle) ||
        (distributor.note ?? '').toLowerCase().includes(needle)
      )
    })
    .sort((a, b) => (b.archivedAt ?? b.updatedAt).localeCompare(a.archivedAt ?? a.updatedAt))

  return (
    <div className="page archive-page">
      <PageHeader
        title={t('archive.title')}
        actions={
          archived.length ? (
            <Badge tone="muted">{t('archive.total', { count: formatNumber(archived.length, lang) })}</Badge>
          ) : undefined
        }
      />

      {archived.length === 0 ? (
        <EmptyState
          icon={<Archive size={30} />}
          title={t('archive.empty')}
          text={t('archive.emptyText')}
        />
      ) : (
        <>
          <div className="list-toolbar list-toolbar-end">
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
            <EmptyState icon={<Archive size={26} />} title={t('dist.emptyFilter')} />
          )}
        </>
      )}
    </div>
  )
}
