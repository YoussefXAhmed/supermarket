import { PageHeader } from '../../components/ui';
import { getERPQueryReportUrl } from '../../utils/erpLinks';

const REPORTS = [
  { name: 'Sales Register',       desc: 'Detailed sales transactions with item-level breakdowns.',   icon: '📊' },
  { name: 'Stock Balance',        desc: 'Current stock levels across all warehouses.',               icon: '📦' },
  { name: 'Customer Ledger',      desc: 'Account payable / receivable per customer.',                icon: '👥' },
  { name: 'Profit & Loss',        desc: 'Income, cost of goods, and net profit summary.',            icon: '💹' },
  { name: 'Item-wise Sales',      desc: 'Top-selling products ranked by revenue.',                   icon: '🏆' },
  { name: 'Daily Cash Register',  desc: 'POS daily totals broken down by payment method.',           icon: '💳' },
];

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="ERPNext standard reports — opens in ERPNext portal" />
      <div className="reports-grid">
        {REPORTS.map(r => (
          <div key={r.name} className="report-card">
            <span className="report-card__icon">{r.icon}</span>
            <div>
              <p className="report-card__name">{r.name}</p>
              <p className="report-card__desc">{r.desc}</p>
            </div>
            <a
              href={getERPQueryReportUrl(r.name)}
              target="_blank" rel="noreferrer"
              className="btn btn--ghost btn--sm"
              style={{ marginTop: 12, alignSelf: 'flex-start' }}
            >
              Open ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
