import { useI18n } from '../i18n'
import type { DailyPoint } from '../lib/stats'
import { formatDayMonth, formatNumber, formatPercent } from '../lib/utils'

export function ActivityChart({ points }: { points: DailyPoint[] }) {
  const { lang, t } = useI18n()
  const max = Math.max(1, ...points.map((point) => point.count))
  const total = points.reduce((sum, point) => sum + point.count, 0)

  return (
    <div className="activity-chart">
      <div className="chart-summary">
        <strong>{formatNumber(total, lang)}</strong>
        <span>{t('dashboard.chart.total')}</span>
      </div>
      {total === 0 ? (
        <div className="chart-empty">{t('chart.noData')}</div>
      ) : (
        <div className="chart-plot" role="img" aria-label={t('dashboard.chart.subtitle')}>
          <div className="chart-gridlines" aria-hidden="true" />
          {points.map((point) => {
            const height = point.count === 0 ? 0 : Math.max(6, (point.count / max) * 100)
            const senditShare = point.count > 0 ? point.sendit / point.count : 0
            return (
              <div className="bar-col" key={point.date}>
                <div className="bar-tooltip">
                  <span className="bar-tooltip-date">
                    {formatDayMonth(point.date, lang)}
                  </span>
                  <span className="bar-tooltip-value">
                    {formatNumber(point.count, lang)} {t('common.parcels')}
                  </span>
                  <span className="bar-tooltip-sendit">
                    {formatNumber(point.sendit, lang)} {t('common.sendit')}
                  </span>
                </div>
                <div className="bar-track">
                  <div className="bar" style={{ height: `${height}%` }}>
                    <div
                      className="bar-sendit"
                      style={{ height: `${senditShare * 100}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
                <span className="bar-label">{formatDayMonth(point.date, lang)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function SenditDonut({
  sendit,
  standard,
  total,
  share,
}: {
  sendit: number
  standard: number
  total: number
  share: number
}) {
  const { lang, t } = useI18n()
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const filled = Math.min(1, Math.max(0, share)) * circumference

  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 132 132" role="img" aria-label={`${t('dashboard.split.center')} ${formatPercent(share, lang)}`}>
          <defs>
            <linearGradient id="donut-gradient" x1="0" y1="0" x2="132" y2="132" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#8db8ff" />
              <stop offset="1" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
          <circle className="donut-track" cx="66" cy="66" r={radius} />
          <circle
            className="donut-value"
            cx="66"
            cy="66"
            r={radius}
            strokeDasharray={`${filled} ${circumference - filled}`}
            strokeDashoffset={0}
          />
        </svg>
        <div className="donut-center">
          <strong>{formatPercent(share, lang)}</strong>
          <span>{t('dashboard.split.center')}</span>
        </div>
      </div>

      <div className="donut-legend">
        <div className="legend-row">
          <span className="legend-dot legend-dot-accent" />
          <span className="legend-label">{t('dashboard.split.center')}</span>
          <span className="legend-value">{formatNumber(sendit, lang)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-dot" />
          <span className="legend-label">{t('dashboard.split.standard')}</span>
          <span className="legend-value">{formatNumber(standard, lang)}</span>
        </div>
        <div className="legend-row legend-total">
          <span className="legend-label">{t('common.total')}</span>
          <span className="legend-value">{formatNumber(total, lang)}</span>
        </div>
      </div>
    </div>
  )
}

export function SplitBar({
  sendit,
  standard,
}: {
  sendit: number
  standard: number
}) {
  const total = sendit + standard
  const share = total > 0 ? (sendit / total) * 100 : 0
  return (
    <div className="split-bar" aria-hidden="true">
      <span className="split-sendit" style={{ width: `${share}%` }} />
      <span className="split-standard" style={{ width: `${100 - share}%` }} />
    </div>
  )
}
