import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/ui';
import { DashboardLayout, LayoutSection } from '../../components/layout/page-layouts';
import { getERPQueryReportUrl } from '../../utils/erpLinks';

export default function ReportsPage() {
  const { t } = useTranslation();

  const REPORTS = [
    { nameKey: 'admin.reports.salesRegister', descKey: 'admin.reports.salesRegisterDesc', icon: '📊' },
    { nameKey: 'admin.reports.stockBalance', descKey: 'admin.reports.stockBalanceDesc', icon: '📦' },
    { nameKey: 'admin.reports.customerLedger', descKey: 'admin.reports.customerLedgerDesc', icon: '👥' },
    { nameKey: 'admin.reports.profitLoss', descKey: 'admin.reports.profitLossDesc', icon: '💹' },
    { nameKey: 'admin.reports.itemWiseSales', descKey: 'admin.reports.itemWiseSalesDesc', icon: '🏆' },
    { nameKey: 'admin.reports.dailyCashRegister', descKey: 'admin.reports.dailyCashRegisterDesc', icon: '💳' },
  ];

  const ERP_REPORT_NAMES = {
    'admin.reports.salesRegister': 'Sales Register',
    'admin.reports.stockBalance': 'Stock Balance',
    'admin.reports.customerLedger': 'Customer Ledger',
    'admin.reports.profitLoss': 'Profit and Loss Statement',
    'admin.reports.itemWiseSales': 'Item-wise Sales Register',
    'admin.reports.dailyCashRegister': 'Daily Cash Register Summary',
  };

  return (
    <DashboardLayout>
      <PageHeader
        title={t('admin.reports.title')}
        subtitle={t('admin.reports.subtitle')}
        dense
      />
      <LayoutSection variant="raised" flushHead>
        <div className="reports-grid">
          {REPORTS.map((r) => (
            <div key={r.nameKey} className="report-card">
              <span className="report-card__icon">{r.icon}</span>
              <div>
                <p className="report-card__name">{t(r.nameKey)}</p>
                <p className="report-card__desc">{t(r.descKey)}</p>
              </div>
              <a
                href={getERPQueryReportUrl(ERP_REPORT_NAMES[r.nameKey])}
                target="_blank"
                rel="noreferrer"
                className="btn btn--ghost btn--sm report-card__action"
              >
                {t('admin.reports.open')}
              </a>
            </div>
          ))}
        </div>
      </LayoutSection>
    </DashboardLayout>
  );
}
