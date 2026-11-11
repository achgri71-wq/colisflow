import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Database,
  Download,
  HardDrive,
  Info,
  Keyboard,
  Monitor,
  Moon,
  ScanBarcode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Sun,
  SunMoon,
  Trash,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import type { BackupPayload, Language, ThemeMode } from '../types'
import { useI18n } from '../i18n'
import { useStore } from '../store/useStore'
import { useDialog } from '../components/Dialog'
import { useToast } from '../components/Toast'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { Badge, PageHeader, Segmented, Toggle } from '../components/ui'
import { senditPrefixesFromInput } from '../lib/codes'
import { storageUsage } from '../lib/db'
import {
  dayKey,
  downloadJson,
  formatNumber,
  formatPercent,
  percent,
  readTextFile,
  storageLabel,
} from '../lib/utils'

const APP_VERSION = '1.0.0'

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
]

function isBackup(value: unknown): value is BackupPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<BackupPayload>
  return (
    payload.app === 'colisflow' &&
    Array.isArray(payload.distributors) &&
    Array.isArray(payload.sessions) &&
    Array.isArray(payload.codes)
  )
}

export function SettingsPage() {
  const { t, lang, setLang } = useI18n()
  const dialog = useDialog()
  const toast = useToast()
  const installPrompt = useInstallPrompt()

  const settings = useStore((state) => state.settings)
  const distributors = useStore((state) => state.distributors)
  const sessions = useStore((state) => state.sessions)
  const codes = useStore((state) => state.codes)
  const events = useStore((state) => state.events)
  const setSettings = useStore((state) => state.setSettings)
  const seedDemo = useStore((state) => state.seedDemo)
  const resetAll = useStore((state) => state.resetAll)
  const importData = useStore((state) => state.importData)

  const fileRef = useRef<HTMLInputElement>(null)
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null)
  const [prefixText, setPrefixText] = useState(settings.senditPrefixes.join(', '))

  const wakeSupported =
    typeof navigator !== 'undefined' && 'wakeLock' in (navigator as Navigator)

  const refreshStorage = async () => {
    const usage = await storageUsage()
    setStorage(usage)
  }

  useEffect(() => {
    void refreshStorage()
  }, [])

  useEffect(() => {
    setPrefixText(settings.senditPrefixes.join(', '))
  }, [settings.senditPrefixes])

  const themeOptions: { value: ThemeMode; label: string; icon: ReactNode }[] = [
    { value: 'dark', label: t('settings.theme.dark'), icon: <Moon size={15} /> },
    { value: 'light', label: t('settings.theme.light'), icon: <Sun size={15} /> },
    { value: 'system', label: t('settings.theme.system'), icon: <Monitor size={15} /> },
  ]

  const commitPrefixes = () => {
    const parsed = senditPrefixesFromInput(prefixText)
    if (!parsed.length) {
      setPrefixText(settings.senditPrefixes.join(', '))
      return
    }
    setSettings({ senditPrefixes: parsed })
    setPrefixText(parsed.join(', '))
  }

  const exportBackup = () => {
    const payload: BackupPayload = {
      app: 'colisflow',
      version: 1,
      exportedAt: new Date().toISOString(),
      distributors,
      sessions,
      codes,
      events,
      settings,
    }
    downloadJson(payload, `colisflow-backup-${dayKey(new Date())}.json`)
    toast.push({ message: t('settings.exportDone'), tone: 'success' })
  }

  const importBackup = async (file: File) => {
    try {
      const text = await readTextFile(file)
      const parsed: unknown = JSON.parse(text)
      if (!isBackup(parsed)) {
        toast.push({ title: t('settings.importError'), tone: 'error' })
        return
      }
      const confirmed = await dialog.confirm({
        title: t('settings.importTitle'),
        message: t('settings.importMsg'),
        confirmLabel: t('settings.importBackup'),
        tone: 'warning',
      })
      if (!confirmed) return
      await importData(
        {
          distributors: parsed.distributors,
          sessions: parsed.sessions,
          codes: parsed.codes,
          events: parsed.events ?? [],
        },
        parsed.settings,
      )
      await refreshStorage()
      toast.push({ message: t('settings.imported'), tone: 'success' })
    } catch {
      toast.push({ title: t('settings.importError'), tone: 'error' })
    }
  }

  const loadDemo = async () => {
    const confirmed = await dialog.confirm({
      title: t('settings.demoTitle'),
      message: t('settings.demoMsg'),
      confirmLabel: t('settings.demoAction'),
      tone: 'primary',
    })
    if (!confirmed) return
    await seedDemo()
    await refreshStorage()
    toast.push({ message: t('settings.demoDone'), tone: 'success' })
  }

  const reset = async () => {
    const confirmed = await dialog.confirm({
      title: t('settings.resetTitle'),
      message: t('settings.resetMsg'),
      confirmLabel: t('settings.resetAction'),
      tone: 'danger',
    })
    if (!confirmed) return
    await resetAll()
    await refreshStorage()
    toast.push({ message: t('settings.resetDone'), tone: 'success' })
  }

  const install = async () => {
    const outcome = await installPrompt.install()
    if (outcome === 'accepted') {
      toast.push({ message: t('settings.installed'), tone: 'success' })
    }
  }

  const records = distributors.length + sessions.length + codes.length
  const usedShare = storage?.quota ? percent(storage.used, storage.quota) : 0

  return (
    <div className="page settings-page">
      <PageHeader title={t('settings.title')} />

      <div className="settings-grid">
        <div className="settings-col">
          <section className="card settings-card">
            <div className="settings-head">
              <span className="settings-icon"><SunMoon size={19} /></span>
              <div>
                <h2>{t('settings.appearance')}</h2>
                <p>{t('settings.appearanceText')}</p>
              </div>
            </div>

            <div className="setting-block">
              <span className="field-label">{t('settings.theme')}</span>
              <Segmented
                value={settings.theme}
                options={themeOptions}
                onChange={(theme) => setSettings({ theme })}
                label={t('settings.theme')}
              />
            </div>

            <div className="setting-block">
              <span className="field-label">{t('settings.language')}</span>
              <Segmented
                value={lang}
                options={LANGUAGE_OPTIONS}
                onChange={(next) => setLang(next)}
                label={t('settings.language')}
              />
            </div>
          </section>

          <section className="card settings-card">
            <div className="settings-head">
              <span className="settings-icon"><Store size={19} /></span>
              <div>
                <h2>{t('settings.workspace')}</h2>
                <p>{t('settings.workspaceText')}</p>
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="shop-name">
                  {t('settings.shop')}
                </label>
                <input
                  id="shop-name"
                  className="input"
                  value={settings.shopName}
                  onChange={(event) => setSettings({ shopName: event.target.value })}
                  placeholder={t('settings.shopPlaceholder')}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="operator-name">
                  {t('settings.operator')}
                </label>
                <input
                  id="operator-name"
                  className="input"
                  value={settings.operatorName}
                  onChange={(event) => setSettings({ operatorName: event.target.value })}
                  placeholder={t('settings.operatorPlaceholder')}
                />
              </div>
            </div>
            <div className="settings-saved">{t('settings.saved')}</div>
          </section>

          <section className="card settings-card">
            <div className="settings-head">
              <span className="settings-icon"><ScanBarcode size={19} /></span>
              <div>
                <h2>{t('settings.scanning')}</h2>
                <p>{t('settings.scanningText')}</p>
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="sendit-prefixes">
                {t('settings.prefixes')}
              </label>
              <input
                id="sendit-prefixes"
                className="input input-mono"
                value={prefixText}
                onChange={(event) => setPrefixText(event.target.value)}
                onBlur={commitPrefixes}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitPrefixes()
                    event.currentTarget.blur()
                  }
                }}
                placeholder="DH, DXH, DSH"
                spellCheck={false}
              />
              <div className="field-hint">{t('settings.prefixesHint')}</div>
            </div>

            <div className="toggle-stack">
              <Toggle
                checked={settings.sound}
                onChange={(sound) => setSettings({ sound })}
                label={t('settings.sound')}
                description={t('settings.soundText')}
              />
              <Toggle
                checked={settings.haptics}
                onChange={(haptics) => setSettings({ haptics })}
                label={t('settings.haptics')}
                description={t('settings.hapticsText')}
              />
              <Toggle
                checked={settings.keepAwake}
                onChange={(keepAwake) => setSettings({ keepAwake })}
                label={t('settings.keepAwake')}
                description={
                  wakeSupported ? t('settings.keepAwakeText') : t('settings.keepAwakeUnsupported')
                }
                disabled={!wakeSupported}
              />
            </div>
          </section>

          <section className="card settings-card">
            <div className="settings-head">
              <span className="settings-icon"><Smartphone size={19} /></span>
              <div>
                <h2>{t('settings.install')}</h2>
                <p>{t('settings.installText')}</p>
              </div>
            </div>
            {installPrompt.installed ? (
              <div className="install-row">
                <Badge tone="accent" dot>
                  {t('settings.installed')}
                </Badge>
              </div>
            ) : (
              <div className="install-row">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void install()}
                  disabled={!installPrompt.canInstall}
                >
                  <Download size={15} />
                  {installPrompt.canInstall ? t('settings.installAction') : t('common.none')}
                </button>
                <span className="field-hint">{t('settings.iosHint')}</span>
              </div>
            )}
          </section>
        </div>

        <div className="settings-col">
          <section className="card settings-card">
            <div className="settings-head">
              <span className="settings-icon"><Database size={19} /></span>
              <div>
                <h2>{t('settings.data')}</h2>
                <p>{t('settings.dataText')}</p>
              </div>
            </div>

            <div className="storage-box">
              <div className="storage-top">
                <span>
                  <HardDrive size={15} />
                  {t('settings.storage')}
                </span>
                <span className="mono">
                  {storage
                    ? t('settings.storageUsed', { used: storageLabel(storage.used) })
                    : t('settings.storageUnavailable')}
                </span>
              </div>
              <div className="storage-bar">
                <span style={{ width: `${Math.min(100, Math.max(1, usedShare * 100))}%` }} />
              </div>
              <div className="storage-meta">
                <span>{formatPercent(usedShare, lang)}</span>
                <span>{t('settings.records', { count: formatNumber(records, lang) })}</span>
              </div>
            </div>

            <div className="data-actions">
              <button type="button" className="data-action" onClick={exportBackup}>
                <span className="data-action-icon"><Download size={18} /></span>
                <span>
                  <strong>{t('settings.exportBackup')}</strong>
                  <span>{t('settings.backupText')}</span>
                </span>
              </button>

              <button
                type="button"
                className="data-action"
                onClick={() => fileRef.current?.click()}
              >
                <span className="data-action-icon"><Upload size={18} /></span>
                <span>
                  <strong>{t('settings.importBackup')}</strong>
                  <span>{t('settings.backupText')}</span>
                </span>
              </button>

              <button type="button" className="data-action" onClick={() => void loadDemo()}>
                <span className="data-action-icon"><Sparkles size={18} /></span>
                <span>
                  <strong>{t('settings.demoAction')}</strong>
                  <span>{t('settings.demoText')}</span>
                </span>
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importBackup(file)
                event.target.value = ''
              }}
            />

            <div className="privacy-note">
              <ShieldCheck size={16} />
              <div>
                <strong>{t('settings.privacy')}</strong>
                <p>{t('settings.privacyText')}</p>
              </div>
            </div>
          </section>

          <section className="card settings-card danger-card">
            <div className="settings-head">
              <span className="settings-icon is-danger"><TriangleAlert size={19} /></span>
              <div>
                <h2>{t('settings.danger')}</h2>
                <p>{t('settings.resetText')}</p>
              </div>
            </div>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => void reset()}>
              <Trash size={15} />
              {t('settings.resetAction')}
            </button>
          </section>

          <section className="card settings-card">
            <div className="settings-head">
              <span className="settings-icon"><Info size={19} /></span>
              <div>
                <h2>{t('settings.about')}</h2>
                <p>{t('settings.aboutText')}</p>
              </div>
            </div>

            <div className="about-row">
              <span>{t('settings.version')}</span>
              <span className="mono">{APP_VERSION}</span>
            </div>
            <div className="about-row">
              <span>{t('app.tagline')}</span>
              <Badge tone="accent" dot>
                {t('common.local')}
              </Badge>
            </div>

            <div className="shortcuts-box">
              <div className="shortcuts-title">
                <Keyboard size={15} />
                {t('settings.shortcuts')}
              </div>
              <div className="shortcut-row">
                <span>{t('settings.shortcutSearch')}</span>
                <kbd>Ctrl</kbd>
                <kbd>K</kbd>
              </div>
              <div className="shortcut-row">
                <span>{t('settings.shortcutNew')}</span>
                <kbd>N</kbd>
              </div>
              <div className="shortcut-row">
                <span>{t('settings.shortcutClose')}</span>
                <kbd>Esc</kbd>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
