import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import type { Language } from '../types'
import { localeFor } from '../lib/utils'
import { useStore } from '../store/useStore'
import { dictionaries, fr, type TranslationKey } from './dict'

interface I18nContextValue {
  lang: Language
  dir: 'ltr' | 'rtl'
  locale: string
  setLang: (lang: Language) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useStore((state) => state.settings.lang)
  const setSettings = useStore((state) => state.setSettings)

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.dataset.lang = lang
  }, [lang])

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const dictionary = dictionaries[lang] as Record<string, string>
      const template = dictionary[key] ?? fr[key] ?? key
      if (!vars) return template
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
      )
    },
    [lang],
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      locale: localeFor(lang),
      setLang: (next) => setSettings({ lang: next }),
      t,
    }),
    [lang, setSettings, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside I18nProvider')
  return context
}
