import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { CircleAlert, CircleCheckBig, Info, TriangleAlert, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { cx, uid } from '../lib/utils'

export type ToastTone = 'success' | 'error' | 'warning' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  title?: string
  message?: string
  tone?: ToastTone
  action?: ToastAction
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: string
  tone: ToastTone
}

interface ToastContextValue {
  push: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TONE_ICONS = {
  success: CircleCheckBig,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
}

const TONE_KEYS = {
  success: 'toast.success',
  error: 'toast.error',
  warning: 'toast.warning',
  info: 'toast.info',
} as const

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (options: ToastOptions) => {
      const id = uid('toast')
      const tone = options.tone ?? 'success'
      const item: ToastItem = { ...options, tone, id }
      setItems((current) => [item, ...current].slice(0, 4))
      const timer = setTimeout(
        () => dismiss(id),
        options.duration ?? (options.action ? 7000 : tone === 'error' ? 5000 : 3600),
      )
      timers.current.set(id, timer)
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const current = timers.current
    return () => {
      current.forEach((timer) => clearTimeout(timer))
      current.clear()
    }
  }, [])

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {items.map((item) => {
          const Icon = TONE_ICONS[item.tone]
          return (
            <div key={item.id} className={cx('toast', `toast-${item.tone}`)} role="status">
              <span className="toast-icon">
                <Icon size={18} strokeWidth={2.4} />
              </span>
              <div className="toast-content">
                <div className="toast-title">{item.title ?? t(TONE_KEYS[item.tone])}</div>
                {item.message ? <div className="toast-message">{item.message}</div> : null}
                {item.action ? (
                  <button
                    type="button"
                    className="toast-action"
                    onClick={() => {
                      item.action?.onClick()
                      dismiss(item.id)
                    }}
                  >
                    {item.action.label}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="toast-close"
                onClick={() => dismiss(item.id)}
                aria-label={t('common.close')}
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
