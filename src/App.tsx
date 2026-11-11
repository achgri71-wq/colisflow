import { lazy, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Layout, BrandMark } from './components/Layout'
import { useToast } from './components/Toast'
import { StartSessionModal } from './components/StartSessionModal'
import { useI18n } from './i18n'
import { useThemeEffect } from './hooks/useThemeEffect'
import { useWakeLock } from './hooks/useWakeLock'
import { useStore } from './store/useStore'
import { isTypingTarget } from './lib/utils'

const ScanPage = lazy(() => import('./pages/Scan').then((module) => ({ default: module.ScanPage })))
const DistributorsPage = lazy(() =>
  import('./pages/Distributors').then((module) => ({ default: module.DistributorsPage })),
)
const DistributorDetailPage = lazy(() =>
  import('./pages/DistributorDetail').then((module) => ({
    default: module.DistributorDetailPage,
  })),
)
const SearchPage = lazy(() =>
  import('./pages/Search').then((module) => ({ default: module.SearchPage })),
)
const SettingsPage = lazy(() =>
  import('./pages/Settings').then((module) => ({ default: module.SettingsPage })),
)
const NotFoundPage = lazy(() =>
  import('./pages/NotFound').then((module) => ({ default: module.NotFoundPage })),
)

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    const main = document.querySelector('.main')
    if (main) main.scrollTo({ top: 0 })
    window.scrollTo({ top: 0 })
  }, [pathname])

  return null
}

export function App() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()

  const ready = useStore((state) => state.ready)
  const init = useStore((state) => state.init)
  const keepAwake = useStore((state) => state.settings.keepAwake)

  const [startOpen, setStartOpen] = useState(false)

  useThemeEffect()
  useWakeLock(keepAwake && ready)

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW()
  const [refreshNeeded] = needRefresh
  const [isOfflineReady] = offlineReady
  const refreshNotified = useRef(false)
  const offlineNotified = useRef(false)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (!refreshNeeded || refreshNotified.current) return
    refreshNotified.current = true
    toast.push({
      title: t('pwa.updateTitle'),
      message: t('pwa.updateText'),
      tone: 'info',
      duration: 20_000,
      action: {
        label: t('pwa.reload'),
        onClick: () => void updateServiceWorker(true),
      },
    })
  }, [refreshNeeded, t, toast, updateServiceWorker])

  useEffect(() => {
    if (!isOfflineReady || offlineNotified.current) return
    offlineNotified.current = true
    toast.push({
      title: t('pwa.ready'),
      message: t('pwa.readyText'),
      tone: 'success',
      duration: 4000,
    })
  }, [isOfflineReady, t, toast])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        navigate('/search')
        return
      }

      if (
        !modifier &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        event.key.toLowerCase() === 'n' &&
        !isTypingTarget(event.target) &&
        !document.querySelector('.modal-backdrop')
      ) {
        event.preventDefault()
        setStartOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  if (!ready) {
    return (
      <div className="splash" role="status" aria-live="polite">
        <BrandMark size={64} />
        <div className="splash-title">{t('app.name')}</div>
        <div className="splash-tagline">{t('app.tagline')}</div>
        <div className="splash-loader" aria-hidden="true">
          <span />
        </div>
        <div className="splash-text">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/scan" replace />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="distributors" element={<DistributorsPage />} />
          <Route path="distributors/:id" element={<DistributorDetailPage />} />
          <Route path="archive" element={<Navigate to="/distributors" replace />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="dashboard" element={<Navigate to="/scan" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>

      <StartSessionModal open={startOpen} onClose={() => setStartOpen(false)} />
    </>
  )
}
