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
import { createPortal } from 'react-dom'
import { TriangleAlert, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { cx } from '../lib/utils'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger' | 'warning'
}

export interface PromptOptions {
  title: string
  message?: string
  label?: string
  initialValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  validate?: (value: string) => string | null
}

interface ConfirmState extends ConfirmOptions {
  kind: 'confirm'
  resolve: (value: boolean) => void
}

interface PromptState extends PromptOptions {
  kind: 'prompt'
  resolve: (value: string | null) => void
}

type DialogState = ConfirmState | PromptState

interface DialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  prompt: (options: PromptOptions) => Promise<string | null>
}

const DialogContext = createContext<DialogContextValue | null>(null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [state, setState] = useState<DialogState | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ ...options, kind: 'confirm', resolve })
        setError(null)
      }),
    [],
  )

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setState({ ...options, kind: 'prompt', resolve })
        setValue(options.initialValue ?? '')
        setError(null)
      }),
    [],
  )

  const close = useCallback(
    (result: boolean | string | null) => {
      setState((current) => {
        if (!current) return null
        if (current.kind === 'confirm') current.resolve(Boolean(result))
        else current.resolve(typeof result === 'string' ? result : null)
        return null
      })
      setError(null)
    },
    [],
  )

  useEffect(() => {
    if (!state) return
    const timer = setTimeout(() => {
      if (state.kind === 'prompt') inputRef.current?.focus()
      else confirmRef.current?.focus()
    }, 40)
    return () => clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (!state) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(state.kind === 'confirm' ? false : null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [state, close])

  const submit = () => {
    if (!state) return
    if (state.kind === 'confirm') {
      close(true)
      return
    }
    const trimmed = value.trim()
    const validation =
      state.validate?.(trimmed) ?? (trimmed ? null : t('dialog.required'))
    if (validation) {
      setError(validation)
      return
    }
    close(trimmed)
  }

  const context = useMemo(() => ({ confirm, prompt }), [confirm, prompt])

  if (!state) {
    return <DialogContext.Provider value={context}>{children}</DialogContext.Provider>
  }

  const tone = state.kind === 'confirm' ? (state.tone ?? 'danger') : 'primary'

  return (
    <DialogContext.Provider value={context}>
      {children}
      {createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close(state.kind === 'confirm' ? false : null)
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <div className={cx('dialog-icon', `tone-${tone}`)}>
              <TriangleAlert size={22} />
            </div>
            <button
              type="button"
              className="dialog-close"
              onClick={() => close(state.kind === 'confirm' ? false : null)}
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
            <h2 id="dialog-title" className="dialog-title">
              {state.title}
            </h2>
            {state.message ? <p className="dialog-message">{state.message}</p> : null}

            {state.kind === 'prompt' ? (
              <form
                className="dialog-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  submit()
                }}
              >
                {state.label ? <label className="field-label">{state.label}</label> : null}
                <input
                  ref={inputRef}
                  className={cx('input', error && 'input-error')}
                  value={value}
                  placeholder={state.placeholder}
                  onChange={(event) => {
                    setValue(event.target.value)
                    if (error) setError(null)
                  }}
                  autoComplete="off"
                />
                {error ? <div className="field-error">{error}</div> : null}
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => close(null)}
                  >
                    {state.cancelLabel ?? t('dialog.cancel')}
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {state.confirmLabel ?? t('dialog.confirm')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="dialog-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => close(false)}
                >
                  {state.cancelLabel ?? t('dialog.cancel')}
                </button>
                <button
                  ref={confirmRef}
                  type="button"
                  className={cx(
                    'btn',
                    tone === 'primary' ? 'btn-primary' : tone === 'warning' ? 'btn-warning' : 'btn-danger',
                  )}
                  onClick={() => close(true)}
                >
                  {state.confirmLabel ?? t('dialog.confirm')}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </DialogContext.Provider>
  )
}

export function useDialog(): DialogContextValue {
  const context = useContext(DialogContext)
  if (!context) throw new Error('useDialog must be used inside DialogProvider')
  return context
}
