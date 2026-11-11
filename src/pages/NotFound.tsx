import { Link } from 'react-router-dom'
import { ArrowLeft, House, PackageSearch } from 'lucide-react'
import { useI18n } from '../i18n'
import { EmptyState } from '../components/ui'

export function NotFoundPage() {
  const { t } = useI18n()

  return (
    <div className="page notfound-page">
      <EmptyState
        icon={<PackageSearch size={32} />}
        title={t('notfound.title')}
        text={t('notfound.text')}
        action={
          <div className="notfound-actions">
            <Link to="/" className="btn btn-primary">
              <House size={16} />
              {t('notfound.home')}
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => window.history.back()}
            >
              <ArrowLeft size={16} className="flip-rtl" />
              {t('common.back')}
            </button>
          </div>
        }
      />
    </div>
  )
}
