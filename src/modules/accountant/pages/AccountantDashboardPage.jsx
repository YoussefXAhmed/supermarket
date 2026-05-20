import { Link } from 'react-router-dom';
import { PageHeader, StatCard } from '../../../components/ui';
import { DashboardLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { useAuth } from '../../../hooks/useAuth';
import { useApprovalQueues } from '../../approvals/hooks/useApprovalQueues';
import { RoleBadge } from '../../../components/ui';

const LINKS = [
  { to: '/admin/accounting/matching', label: 'Invoice matching', desc: 'Create bills from receipts', icon: '🧾', cap: 'canAccessInvoiceMatching' },
  { to: '/admin/accounting/payments', label: 'Supplier payments', desc: 'AP, aging, ERP Payment Entry', icon: '💳', cap: 'canViewSupplierPayments' },
  { to: '/admin/approvals', label: 'Approvals hub', desc: 'Purchases, shifts, variance, history', icon: '✓' },
  { to: '/admin/invoices', label: 'Sales invoices', desc: 'Customer sales invoices', icon: '🧾', cap: 'canViewInvoices' },
  { to: '/admin/reports', label: 'Financial reports', desc: 'Purchasing and sales reporting', icon: '📊', cap: 'canViewReports' },
  { to: '/admin/shifts/history', label: 'Shift approvals', desc: 'Review cashier closings', icon: '◷', cap: 'canViewShiftReports' },
  { to: '/admin/purchasing/approvals', label: 'Purchase rate approvals', desc: 'Buying price variance queue', icon: '🛍️', cap: 'canViewPurchaseApprovals' },
];

export default function AccountantDashboardPage() {
  const { capabilities } = useAuth();
  const { counts, loading } = useApprovalQueues();

  const links = LINKS.filter((item) => !item.cap || capabilities[item.cap]);

  return (
    <DashboardLayout>
      <PageHeader
        title="Finance workspace"
        subtitle="Approvals, payments, and reporting — no POS selling or inventory execution."
        dense
      />

      <div className="accountant-hero">
        <RoleBadge />
        <p className="accountant-hero__hint">
          Scoped to your ERP company and warehouse permissions. Stock transfers and reconciliation are not available in this workspace.
        </p>
      </div>

      <section className="layout-grid layout-grid--kpi" aria-label="Pending work">
        <StatCard label="Purchase approvals" value={loading ? '…' : counts.purchases} icon="🛍️" color="amber" compact />
        <StatCard label="Shift approvals" value={loading ? '…' : counts.shifts} icon="◷" color="blue" compact />
        <StatCard label="High variance" value={loading ? '…' : counts.highVariance} icon="⚠" color="red" compact />
      </section>

      <LayoutSection title="Quick links" variant="raised">
        <div className="accountant-links">
          {links.map((item) => (
            <Link key={item.to} to={item.to} className="accountant-links__card">
              <span className="accountant-links__icon">{item.icon}</span>
              <span className="accountant-links__label">{item.label}</span>
              <span className="accountant-links__desc">{item.desc}</span>
            </Link>
          ))}
        </div>
      </LayoutSection>
    </DashboardLayout>
  );
}
