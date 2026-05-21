import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader, StatCard } from '../../../components/ui';
import { DashboardLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { useAuth } from '../../../hooks/useAuth';
import { useApprovalQueues } from '../../approvals/hooks/useApprovalQueues';
import { RoleBadge } from '../../../components/ui';

const LINKS = [
  { to: '/admin/accounting/matching', labelKey: 'nav.invoiceMatching', descKey: 'finance.links.invoiceMatching', icon: '🧾', cap: 'canAccessInvoiceMatching' },
  { to: '/admin/accounting/payments', labelKey: 'nav.supplierPayments', descKey: 'finance.links.supplierPayments', icon: '💳', cap: 'canViewSupplierPayments' },
  { to: '/admin/approvals', labelKey: 'finance.links.approvalsHub', descKey: 'finance.links.approvalsDesc', icon: '✓' },
  { to: '/admin/invoices', labelKey: 'finance.links.salesInvoices', descKey: 'finance.links.salesInvoicesDesc', icon: '🧾', cap: 'canViewInvoices' },
  { to: '/admin/reports', labelKey: 'finance.links.financialReports', descKey: 'finance.links.financialReportsDesc', icon: '📊', cap: 'canViewReports' },
  { to: '/admin/shifts/history', labelKey: 'finance.links.shiftApprovals', descKey: 'finance.links.shiftApprovalsDesc', icon: '◷', cap: 'canViewShiftReports' },
  { to: '/admin/purchasing/approvals', labelKey: 'nav.purchaseRates', descKey: 'finance.links.purchaseRatesDesc', icon: '🛍️', cap: 'canViewPurchaseApprovals' },
];

export default function AccountantDashboardPage() {
  const { t } = useTranslation();
  const { capabilities } = useAuth();
  const { counts, loading } = useApprovalQueues();

  const links = LINKS.filter((item) => !item.cap || capabilities[item.cap]);

  return (
    <DashboardLayout>
      <PageHeader
        title={t('finance.workspaceTitle')}
        subtitle={t('finance.workspaceSubtitle')}
        dense
      />

      <div className="accountant-hero">
        <RoleBadge />
        <p className="accountant-hero__hint">
          {t('finance.workspaceHint')}
        </p>
      </div>

      <section className="layout-grid layout-grid--kpi" aria-label="Pending work">
        <StatCard label={t('finance.purchaseApprovals')} value={loading ? '…' : counts.purchases} icon="🛍️" color="amber" compact />
        <StatCard label={t('finance.shiftApprovals')} value={loading ? '…' : counts.shifts} icon="◷" color="blue" compact />
        <StatCard label={t('finance.highVariance')} value={loading ? '…' : counts.highVariance} icon="⚠" color="red" compact />
      </section>

      <LayoutSection title={t('finance.quickLinks')} variant="raised">
        <div className="accountant-links">
          {links.map((item) => (
            <Link key={item.to} to={item.to} className="accountant-links__card">
              <span className="accountant-links__icon">{item.icon}</span>
              <span className="accountant-links__label">{t(item.labelKey)}</span>
              <span className="accountant-links__desc">{t(item.descKey)}</span>
            </Link>
          ))}
        </div>
      </LayoutSection>
    </DashboardLayout>
  );
}
