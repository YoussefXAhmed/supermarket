import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCurrencyCompact } from '../../utils/format';

export default function TrendChart({ data = [], valueKey = 'value', labelKey = 'label', height = 120 }) {
  const { t } = useTranslation();
  const maxVal = useMemo(
    () => Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1),
    [data, valueKey]
  );

  if (!data.length) {
    return (
      <div
        className="trend-chart__empty"
        style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 'var(--font-sm)' }}
        role="img"
        aria-label={t('dashboardPage.noTrend', { defaultValue: 'No trend data' })}
      >
        <span aria-hidden="true" style={{ fontSize: '1.5rem', marginInlineEnd: 8, opacity: 0.5 }}>📈</span>
        {t('dashboardPage.noTrend', { defaultValue: 'No trend data' })}
      </div>
    );
  }

  return (
    <div className="trend-chart" style={{ height }} role="img" aria-label={t('dashboardPage.salesTrend', { defaultValue: 'Trend chart' })}>
      {data.map((point) => {
        const val = Number(point[valueKey]) || 0;
        const pct = Math.min(100, (val / maxVal) * 100);
        const label = point[labelKey] ?? '';
        return (
          <div key={String(label) + val} className="trend-chart__bar-wrap" title={`${label}: ${fmtCurrencyCompact(val)}`}>
            <div className="trend-chart__bar" style={{ height: `${pct}%` }} />
            <span className="trend-chart__label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
