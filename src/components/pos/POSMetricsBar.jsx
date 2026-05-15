const fmt = (n) =>
  new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(n || 0);

export default function POSMetricsBar({ metrics, shiftOpen }) {
  if (!shiftOpen) return null;
  return (
    <div className="pos-metrics" role="status">
      <div className="pos-metrics__item">
        <span className="pos-metrics__label">Shift sales</span>
        <strong>{fmt(metrics.sales)}</strong>
      </div>
      <div className="pos-metrics__item">
        <span className="pos-metrics__label">Invoices</span>
        <strong>{metrics.invoiceCount}</strong>
      </div>
      <div className="pos-metrics__item">
        <span className="pos-metrics__label">Avg order</span>
        <strong>{fmt(metrics.averageOrder)}</strong>
      </div>
    </div>
  );
}
