import { Badge } from '../ui';

const CATEGORY_LABEL = {
  purchase: { label: 'Purchase', color: 'green' },
  sale: { label: 'Sale', color: 'blue' },
  adjustment: { label: 'Adjustment', color: 'amber' },
  transfer_in: { label: 'Transfer in', color: 'default' },
  transfer_out: { label: 'Transfer out', color: 'default' },
  other: { label: 'Other', color: 'default' },
};

export default function MovementTimeline({ rows }) {
  if (!rows?.length) {
    return <p className="page-header__sub">No stock movements found for this item.</p>;
  }

  return (
    <ul className="movement-timeline">
      {rows.map((row) => {
        const meta = CATEGORY_LABEL[row.category] || CATEGORY_LABEL.other;
        const qty = Number(row.actual_qty || 0);
        return (
          <li key={row.name} className="movement-timeline__item">
            <div className="movement-timeline__dot" data-dir={row.direction} />
            <div className="movement-timeline__body">
              <div className="movement-timeline__head">
                <Badge color={meta.color}>{meta.label}</Badge>
                <span className="mono movement-timeline__qty" data-dir={row.direction}>
                  {qty >= 0 ? '+' : ''}{qty.toFixed(2)}
                </span>
                <span className="movement-timeline__date">{row.posting_date}</span>
              </div>
              <p className="movement-timeline__meta">
                {row.warehouse} · {row.voucher_type} · <span className="mono">{row.voucher_no}</span>
                {row.batch_no ? ` · Batch ${row.batch_no}` : ''}
              </p>
              <p className="movement-timeline__balance">
                Balance after: <span className="mono">{Number(row.qty_after_transaction || 0).toFixed(2)}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
