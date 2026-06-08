/**
 * /finance — Accountant landing dashboard.
 *
 * Real-company shape:
 *   • KPI row (Outstanding Payables · Overdue · Today's Payments ·
 *               Cash in Hand · Bank Balance · Unpaid count) — clickable.
 *   • Pending work alerts (overdue invoices, shift closings to approve).
 *   • Recent activity (last 5 invoices, last 5 payments).
 *   • Top suppliers by outstanding.
 *   • Quick actions (Record payment, AP Aging, General Ledger).
 *
 * Every data point reuses an existing backend endpoint — no new APIs.
 * One page = one round of parallel fetches on mount.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  PageHeader,
  StatCard,
  Btn,
  EmptyState,
  Badge,
  RoleBadge,
} from '../../../components/ui';
import { DashboardLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { useAuth } from '../../../hooks/useAuth';
import { useApprovalQueues } from '../../approvals/hooks/useApprovalQueues';
import {
  fetchApDashboard,
  listApInvoices,
  listSupplierPaymentHistory,
} from '../../../services/accountsPayableService';
import { fmtCurrency, fmtDate } from '../../../utils/format';
import { financePath } from '../../../utils/workspacePaths';

// All KPI cards funnel into a sensible drill-down. Keys mirror the
// dashboard data keys so the wiring stays declarative.
const KPI_DEFS = [
  { key: 'outstanding',  accentColor: 'amber',  go: 'payments?status=unpaid' },
  { key: 'overdue',      accentColor: 'red',    go: 'payments?status=overdue' },
  { key: 'todayPay',     accentColor: 'green',  go: 'payments?view=history' },
  { key: 'cash',         accentColor: 'accent', go: 'general-ledger?accountType=Cash' },
  { key: 'bank',         accentColor: 'blue',   go: 'general-ledger?accountType=Bank' },
  { key: 'unpaidCount',  accentColor: 'default', go: 'payments?status=unpaid' },
];

export default function AccountantDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { capabilities } = useAuth();
  const { counts: approvalCounts, loading: approvalsLoading } = useApprovalQueues();

  const [dashboard, setDashboard] = useState(null);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [recentPayments, setRecentPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchApDashboard(),
      listApInvoices({ status: 'all', limit: 5 }),
      listSupplierPaymentHistory({ limit: 5 }),
    ]).then(([d, inv, pay]) => {
      if (cancelled) return;
      setDashboard(d.status === 'fulfilled' ? d.value : null);
      setRecentInvoices(inv.status === 'fulfilled' ? (inv.value || []).slice(0, 5) : []);
      setRecentPayments(pay.status === 'fulfilled' ? (pay.value || []).slice(0, 5) : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Sort invoices by due_date ASC so "most urgent first" surfaces on top.
  const upcoming = useMemo(() => {
    const open = (recentInvoices || []).filter((r) => (Number(r.outstanding_amount) || 0) > 0);
    return [...open].sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
  }, [recentInvoices]);

  const topSuppliers = (dashboard?.top_suppliers || []).slice(0, 5);

  const goto = (segment) => navigate(financePath(segment));

  return (
    <DashboardLayout>
      <PageHeader
        title={t('finance.workspaceTitle', { defaultValue: 'Finance' })}
        subtitle={t('finance.workspaceSubtitle', {
          defaultValue: 'Daily AP overview, payments, and reports.',
        })}
        dense
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={() => goto('aging')}>
              {t('nav.apAging', { defaultValue: 'AP Aging' })}
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => goto('general-ledger')}>
              {t('nav.generalLedger', { defaultValue: 'General Ledger' })}
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => goto('payments')}>
              {t('finance.payments.newPayment', { defaultValue: 'Record payment' })}
            </Btn>
          </>
        }
      />

      <div className="accountant-hero">
        <RoleBadge />
        <p className="accountant-hero__hint">
          {t('finance.workspaceHint', {
            defaultValue: 'Everything you need to manage payables in one view.',
          })}
        </p>
      </div>

      {/* ── KPI row — primary KPIs + conditional pending tiles ──────────
          Phase 3.5.d closed audit 9.1: the previous design rendered two
          near-duplicate KPI grids (a primary bar of 6 cards + a "Pending
          work" LayoutSection containing 0-3 more cards using the same
          .layout-grid--kpi class). Both grids now collapse into a single
          row; pending items wear the existing red/amber/blue color
          accents to stand out without needing a separate section. */}
      <section className="layout-grid layout-grid--kpi" aria-label="AP KPIs">
        <button type="button" className="kpi-card-link" onClick={() => goto('payments?status=unpaid')}>
          <StatCard
            label={t('finance.kpi.outstandingPayables', { defaultValue: 'Outstanding payables' })}
            value={loading ? '…' : fmtCurrency(dashboard?.amounts?.total_outstanding || 0)}
            icon="💳" color="amber" compact
          />
        </button>
        <button type="button" className="kpi-card-link" onClick={() => goto('payments?status=overdue')}>
          <StatCard
            label={t('finance.kpi.overdueBills', { defaultValue: 'Overdue bills' })}
            value={loading ? '…' : fmtCurrency(dashboard?.amounts?.overdue_amount || 0)}
            icon="⚠" color="red" compact
          />
        </button>
        <button type="button" className="kpi-card-link" onClick={() => goto('payments?view=history')}>
          <StatCard
            label={t('finance.kpi.todayPayments', { defaultValue: "Today's payments" })}
            value={loading ? '…' : fmtCurrency(dashboard?.amounts?.today_payments || 0)}
            icon="💰" color="green" compact
          />
        </button>
        <button type="button" className="kpi-card-link" onClick={() => goto('general-ledger?accountType=Cash')}>
          <StatCard
            label={t('finance.kpi.cashInHand', { defaultValue: 'Cash in hand' })}
            value={loading ? '…' : fmtCurrency(dashboard?.amounts?.cash_in_hand || 0)}
            icon="🧾" color="accent" compact
          />
        </button>
        <button type="button" className="kpi-card-link" onClick={() => goto('general-ledger?accountType=Bank')}>
          <StatCard
            label={t('finance.kpi.bankBalance', { defaultValue: 'Bank balance' })}
            value={loading ? '…' : fmtCurrency(dashboard?.amounts?.bank_balance || 0)}
            icon="🏦" color="blue" compact
          />
        </button>
        <button type="button" className="kpi-card-link" onClick={() => goto('payments?status=unpaid')}>
          <StatCard
            label={t('finance.kpi.unpaidCount', { defaultValue: 'Unpaid invoices' })}
            value={loading ? '…' : (dashboard?.counts?.unpaid ?? 0)}
            icon="📄" color="default" compact
          />
        </button>

        {/* Pending tiles — same grid, conditionally rendered so the cells
            never disappear mid-row when counts hit zero. */}
        {dashboard?.counts?.overdue > 0 && (
          <Link to={financePath('aging')} className="kpi-card-link">
            <StatCard
              label={t('finance.kpi.overdueInvoicesCount', { defaultValue: 'Overdue invoices' })}
              value={dashboard.counts.overdue}
              icon="⏰" color="red" compact
            />
          </Link>
        )}
        {approvalCounts?.shifts > 0 && (
          <Link to={financePath('approvals')} className="kpi-card-link">
            <StatCard
              label={t('finance.shiftApprovals', { defaultValue: 'Shift approvals' })}
              value={approvalsLoading ? '…' : approvalCounts.shifts}
              icon="◷" color="blue" compact
            />
          </Link>
        )}
        {approvalCounts?.highVariance > 0 && (
          <Link to={financePath('approvals')} className="kpi-card-link">
            <StatCard
              label={t('finance.highVariance', { defaultValue: 'High variance' })}
              value={approvalCounts.highVariance}
              icon="⚠" color="amber" compact
            />
          </Link>
        )}
      </section>

      {/* ── Recent activity (two-column) ───────────────────────────────── */}
      <div className="accountant-recent">
        <LayoutSection
          title={t('finance.recentInvoices', { defaultValue: 'Recent supplier invoices' })}
          variant="raised"
          flushHead
          actions={
            <Btn variant="ghost" size="sm" onClick={() => goto('payments')}>
              {t('common.viewAll', { defaultValue: 'View all' })}
            </Btn>
          }
        >
          {loading ? (
            <p className="page-header__sub">{t('ui.loading')}</p>
          ) : recentInvoices.length === 0 ? (
            <EmptyState
              icon="📭"
              title={t('finance.payments.noInvoices', { defaultValue: 'No invoices' })}
            />
          ) : (
            <ul className="recent-list">
              {recentInvoices.map((r) => (
                <li
                  key={r.name}
                  className="recent-list__item"
                  onClick={() => goto(`payments?invoice=${encodeURIComponent(r.name)}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') goto(`payments?invoice=${encodeURIComponent(r.name)}`); }}
                >
                  <div className="recent-list__primary">
                    <span className="mono">{r.name}</span>
                    <span className="recent-list__sub">{r.supplier_name || r.supplier}</span>
                  </div>
                  <div className="recent-list__meta">
                    <strong>{fmtCurrency(r.grand_total)}</strong>
                    <span className="recent-list__sub">{fmtDate(r.posting_date)}</span>
                  </div>
                  <Badge color={
                    r.payment_status === 'paid' ? 'green'
                    : r.payment_status === 'overdue' ? 'red'
                    : r.payment_status === 'partially_paid' ? 'amber'
                    : 'default'
                  }>{r.payment_status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </LayoutSection>

        <LayoutSection
          title={t('finance.recentPayments', { defaultValue: 'Recent payments' })}
          variant="raised"
          flushHead
          actions={
            <Btn variant="ghost" size="sm" onClick={() => goto('payments?view=history')}>
              {t('common.viewAll', { defaultValue: 'View all' })}
            </Btn>
          }
        >
          {loading ? (
            <p className="page-header__sub">{t('ui.loading')}</p>
          ) : recentPayments.length === 0 ? (
            <EmptyState
              icon="💰"
              title={t('finance.payments.noPayments', { defaultValue: 'No payments' })}
            />
          ) : (
            <ul className="recent-list">
              {recentPayments.map((p) => (
                <li key={p.name} className="recent-list__item">
                  <div className="recent-list__primary">
                    <span className="mono">{p.name}</span>
                    <span className="recent-list__sub">{p.party}</span>
                  </div>
                  <div className="recent-list__meta">
                    <strong>{fmtCurrency(p.paid_amount)}</strong>
                    <span className="recent-list__sub">{fmtDate(p.posting_date)} · {p.mode_of_payment || '—'}</span>
                  </div>
                  <Badge color={p.docstatus === 1 ? 'green' : p.docstatus === 2 ? 'red' : 'default'}>
                    {p.docstatus === 1 ? 'Submitted' : p.docstatus === 2 ? 'Cancelled' : 'Draft'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </LayoutSection>
      </div>

      {/* ── Top suppliers + Upcoming due ──────────────────────────────── */}
      <div className="accountant-recent">
        <LayoutSection
          title={t('nav.topSuppliers', { defaultValue: 'Top suppliers (by outstanding)' })}
          variant="raised"
          flushHead
          actions={
            <Btn variant="ghost" size="sm" onClick={() => goto('top-suppliers')}>
              {t('common.viewAll', { defaultValue: 'View all' })}
            </Btn>
          }
        >
          {loading ? (
            <p className="page-header__sub">{t('ui.loading')}</p>
          ) : topSuppliers.length === 0 ? (
            <EmptyState icon="🏆" title={t('finance.top.empty', { defaultValue: 'No outstanding balances' })} />
          ) : (
            <ul className="recent-list">
              {topSuppliers.map((s, i) => (
                <li key={s.supplier} className="recent-list__item">
                  <div className="recent-list__primary">
                    <span className="recent-list__rank">{i + 1}</span>
                    <span>{s.supplier_name || s.supplier}</span>
                  </div>
                  <div className="recent-list__meta">
                    <strong>{fmtCurrency(s.outstanding)}</strong>
                    <span className="recent-list__sub">
                      {s.invoice_count} {t('finance.aging.invoiceCount', { defaultValue: 'invoices', n: s.invoice_count })}
                    </span>
                  </div>
                  {s.overdue_amount > 0 && (
                    <Badge color="red">{fmtCurrency(s.overdue_amount)}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </LayoutSection>

        <LayoutSection
          title={t('finance.upcomingDue', { defaultValue: 'Upcoming due dates' })}
          variant="raised"
          flushHead
          actions={
            <Btn variant="ghost" size="sm" onClick={() => goto('aging')}>
              {t('common.viewAll', { defaultValue: 'View all' })}
            </Btn>
          }
        >
          {loading ? (
            <p className="page-header__sub">{t('ui.loading')}</p>
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon="✓"
              title={t('finance.allCaughtUp', { defaultValue: "You're all caught up" })}
              desc={t('finance.allCaughtUpDesc', { defaultValue: 'No invoices awaiting payment.' })}
            />
          ) : (
            <ul className="recent-list">
              {upcoming.map((r) => (
                <li
                  key={r.name}
                  className="recent-list__item"
                  onClick={() => goto(`payments?invoice=${encodeURIComponent(r.name)}`)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="recent-list__primary">
                    <span className="mono">{r.name}</span>
                    <span className="recent-list__sub">{r.supplier_name || r.supplier}</span>
                  </div>
                  <div className="recent-list__meta">
                    <strong>{fmtCurrency(r.outstanding_amount)}</strong>
                    <span className="recent-list__sub">
                      {r.due_date ? `${t('finance.payments.due', { defaultValue: 'Due' })} ${fmtDate(r.due_date)}` : ''}
                    </span>
                  </div>
                  {Number(r.days_overdue) > 0 ? (
                    <Badge color="red">
                      {r.days_overdue}d {t('finance.payments.daysOverdue', { defaultValue: 'overdue' })}
                    </Badge>
                  ) : Number(r.days_remaining) <= 7 ? (
                    <Badge color="amber">
                      {r.days_remaining}d {t('finance.payments.daysRemaining', { defaultValue: 'left' })}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </LayoutSection>
      </div>
    </DashboardLayout>
  );
}
