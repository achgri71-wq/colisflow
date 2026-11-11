import type { CSSProperties, ReactNode } from 'react'
import { LoaderCircle, Search, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { cx, hueFromId, initials } from '../lib/utils'

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string
  subtitle?: string
  eyebrow?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-head">
      <div className="page-heading">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}

export function Avatar({
  name,
  id,
  size = 'md',
}: {
  name: string
  id: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const hue = hueFromId(id)
  const style: CSSProperties = {
    background: `linear-gradient(140deg, hsl(${hue} 52% 42%), hsl(${(hue + 46) % 360} 58% 27%))`,
  }
  return (
    <span className={cx('avatar', `avatar-${size}`)} style={style} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'warning' | 'danger' | 'info' | 'muted'
  dot?: boolean
}) {
  return (
    <span className={cx('badge', `badge-${tone}`)}>
      {dot ? <span className="badge-dot" /> : null}
      {children}
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <div className={cx('toggle-row', disabled && 'is-disabled')}>
      <div className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {description ? <span className="toggle-description">{description}</span> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={cx('switch', checked && 'is-on')}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cx('segment', value === option.value && 'is-active')}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  )
}

export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus,
  size = 'md',
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  size?: 'md' | 'lg'
  onSubmit?: () => void
}) {
  const { t } = useI18n()
  return (
    <div className={cx('search-field', size === 'lg' && 'search-field-lg')}>
      <Search size={18} className="search-field-icon" aria-hidden="true" />
      <input
        type="search"
        className="search-field-input"
        value={value}
        placeholder={placeholder ?? t('common.search')}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSubmit) onSubmit()
        }}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        <button
          type="button"
          className="search-field-clear"
          onClick={() => onChange('')}
          aria-label={t('common.clear')}
        >
          <X size={15} />
        </button>
      ) : null}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  compact = false,
}: {
  icon?: ReactNode
  title: string
  text?: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={cx('empty-state', compact && 'empty-state-compact')}>
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}

export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return (
    <span className="spinner" role={label ? 'status' : undefined} aria-label={label}>
      <LoaderCircle size={size} className="spin" />
    </span>
  )
}

export function StatCard({
  icon,
  label,
  value,
  sub,
  tone = 'accent',
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'accent' | 'info' | 'warning' | 'neutral'
}) {
  return (
    <article className={cx('stat-card', `stat-${tone}`)}>
      <div className="stat-top">
        <span className="stat-icon">{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </article>
  )
}
