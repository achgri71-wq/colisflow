import { Suspense } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import {
  Boxes,
  Languages,
  Monitor,
  Moon,
  ScanBarcode,
  Search,
  Settings,
  Sun,
  WifiOff,
} from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore, useActiveSession } from '../store/useStore'
import { useOnline } from '../hooks/useOnline'
import { cx } from '../lib/utils'
import { Spinner } from './ui'
import type { Language } from '../types'

export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <rect width="48" height="48" rx="13" fill="#101a2b" />
      <rect x="0.75" y="0.75" width="46.5" height="46.5" rx="12.25" stroke="#4c8dff" strokeOpacity="0.28" strokeWidth="1.5" />
      <g stroke="#a9c9ff" strokeOpacity="0.58" strokeWidth="0.95" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13.7 28.7L24 33.8V40.9L13.7 35.8V28.7Z" fill="#2b62cf" />
        <path d="M34.3 28.7L24 33.8V40.9L34.3 35.8V28.7Z" fill="#173a88" />
        <path d="M24 23.6L34.3 28.7L24 33.8L13.7 28.7L24 23.6Z" fill="#5b9bff" />
        <path d="M13.7 28.7L24 33.8L34.3 28.7M24 33.8V40.9" />
      </g>
      <g stroke="#ffb454" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 22.3V12.9" />
        <path d="M19.1 15L24 9.9L28.9 15" />
      </g>
    </svg>
  )
}

const WORKSPACE_LINKS = [
  { to: '/scan', label: 'nav.scan', icon: ScanBarcode, end: false },
  { to: '/distributors', label: 'nav.distributors', icon: Boxes, end: false },
] as const

const SYSTEM_LINKS = [
  { to: '/search', label: 'nav.search', icon: Search },
  { to: '/settings', label: 'nav.settings', icon: Settings },
] as const

const MOBILE_LINKS = [
  { to: '/distributors', label: 'nav.distributors', icon: Boxes },
  { to: '/settings', label: 'nav.settings', icon: Settings },
] as const

const THEME_ICONS = { dark: Moon, light: Sun, system: Monitor }
const LANGUAGE_CYCLE: Language[] = ['fr', 'en', 'ar']

export function Layout() {
  const { t, lang, setLang } = useI18n()
  const online = useOnline()
  const activeSession = useActiveSession()
  const codes = useStore((state) => state.codes)
  const theme = useStore((state) => state.settings.theme)
  const setSettings = useStore((state) => state.setSettings)

  const activeCount = activeSession
    ? codes.filter((code) => code.sessionId === activeSession.id).length
    : 0
  const ThemeIcon = THEME_ICONS[theme]

  const cycleTheme = () => {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'
    setSettings({ theme: next })
  }

  const cycleLanguage = () => {
    const index = LANGUAGE_CYCLE.indexOf(lang)
    setLang(LANGUAGE_CYCLE[(index + 1) % LANGUAGE_CYCLE.length])
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/scan" className="side-brand">
          <BrandMark size={42} />
          <span className="side-brand-text">
            <span className="side-brand-name">{t('app.name')}</span>
            <span className="side-brand-tagline">{t('app.tagline')}</span>
          </span>
        </Link>

        <Link to="/search" className="side-search">
          <Search size={16} />
          <span>{t('common.search')}</span>
          <kbd>⌘K</kbd>
        </Link>

        <nav className="side-nav" aria-label={t('nav.workspace')}>
          <div className="side-group-label">{t('nav.workspace')}</div>
          {WORKSPACE_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cx('side-link', isActive && 'is-active')}
            >
              <item.icon size={18} />
              <span>{t(item.label)}</span>
              {item.to === '/scan' && activeSession ? <span className="side-live-dot" /> : null}
            </NavLink>
          ))}

          <div className="side-group-label">{t('nav.system')}</div>
          {SYSTEM_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cx('side-link', isActive && 'is-active')}
            >
              <item.icon size={18} />
              <span>{t(item.label)}</span>
            </NavLink>
          ))}
        </nav>

        {activeSession ? (
          <Link to="/scan" className="side-session">
            <span className="side-session-top">
              <span className="pulse-dot" />
              {t('dashboard.activeTitle')}
            </span>
            <strong>{activeSession.distributorName}</strong>
            <span className="side-session-meta">
              {activeCount} {activeCount === 1 ? t('common.parcel') : t('common.parcels')} ·{' '}
              {t('dashboard.resume')}
            </span>
          </Link>
        ) : (
          <Link to="/scan" className="side-session side-session-idle">
            <span className="side-session-top">
              <span className="dot-muted" />
              {t('scan.noSessionTitle')}
            </span>
            <span className="side-session-meta">{t('scan.noSessionText')}</span>
          </Link>
        )}

        <div className="side-footer">
          <div className="side-status">
            <span className={cx('status-pill', online ? 'is-online' : 'is-offline')}>
              <span className="status-dot" />
              {t(online ? 'common.online' : 'common.offline')}
            </span>
            <span className="side-local">{t('common.local')}</span>
          </div>
          <div className="side-tools">
            <button
              type="button"
              className="side-tool"
              onClick={cycleTheme}
              aria-label={t('settings.theme')}
              title={t(`settings.theme.${theme}`)}
            >
              <ThemeIcon size={16} />
              <span>{t(`settings.theme.${theme}`)}</span>
            </button>
            <button
              type="button"
              className="side-tool side-tool-compact"
              onClick={cycleLanguage}
              aria-label={t('settings.language')}
              title={t('settings.language')}
            >
              <Languages size={16} />
              <span>{lang.toUpperCase()}</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="mobile-top">
          <Link to="/" className="mobile-brand">
            <BrandMark size={34} />
            <span>{t('app.name')}</span>
          </Link>
          <div className="mobile-top-actions">
            <Link to="/search" className="icon-btn" aria-label={t('nav.search')}>
              <Search size={19} />
            </Link>
            <Link to="/scan" className="icon-btn icon-btn-accent" aria-label={t('nav.scan')}>
              <ScanBarcode size={19} />
            </Link>
          </div>
        </header>

        {!online ? (
          <div className="offline-banner" role="status">
            <WifiOff size={16} />
            <span>{t('offline.banner')}</span>
          </div>
        ) : null}

        <Suspense
          fallback={
            <div className="page route-loading" role="status" aria-live="polite">
              <Spinner size={22} />
              <span>{t('common.loading')}</span>
            </div>
          }
        >
          <Outlet />
        </Suspense>

        <footer className="app-footer">
          <span>
            {t('app.name')} · {t('app.tagline')}
          </span>
          <span className="app-footer-local">{t('footer.local')}</span>
        </footer>
      </div>

      <nav className="bottom-nav" aria-label={t('nav.workspace')}>
        {MOBILE_LINKS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cx(
                'bottom-link',
                isActive && 'is-active',
              )
            }
          >
            <span className="bottom-icon">
              <item.icon size={18} />
            </span>
            <span className="bottom-label">{t(item.label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
