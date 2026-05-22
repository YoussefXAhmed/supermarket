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
    return <p className="page-header__sub">{t('ui.noTrendData')}</p>;
  }

  return (
    <div className="trend-chart" style={{ height }} role="img" aria-label={t('ui.trendChart')}>
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
