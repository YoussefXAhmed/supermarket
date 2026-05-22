import { useTranslation } from 'react-i18next';

const fmt = (n) =>
  new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(n || 0);

export default function POSMetricsBar({ metrics, shiftOpen }) {
  const { t } = useTranslation();
  if (!shiftOpen) return null;
  return (
    <div className="pos-metrics" role="status">
      <div className="pos-metrics__item">
        <span className="pos-metrics__label">{t('pos.metrics.shiftSales')}</span>
        <strong>{fmt(metrics.sales)}</strong>
      </div>
      <div className="pos-metrics__item">
        <span className="pos-metrics__label">{t('pos.metrics.invoices')}</span>
        <strong>{metrics.invoiceCount}</strong>
      </div>
      <div className="pos-metrics__item">
        <span className="pos-metrics__label">{t('pos.metrics.avgOrder')}</span>
        <strong>{fmt(metrics.averageOrder)}</strong>
      </div>
    </div>
  );
}
