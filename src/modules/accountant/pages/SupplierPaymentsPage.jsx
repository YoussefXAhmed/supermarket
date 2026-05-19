import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiErrorCard,
  Btn,
  EmptyState,
  PageHeader,
  PageLoading,
  StatCard,
} from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import ApPaymentStatusPill from '../../../components/accounting/ApPaymentStatusPill';
import CreateSupplierPaymentPanel from '../../../components/accounting/CreateSupplierPaymentPanel';
import {
  fetchApDashboard,
  listApInvoices,
  listSupplierPaymentHistory,
} from '../../../services/accountsPayableService';
import { listSuppliers } from '../../../services/purchasingApi';
import { fmtCurrency } from '../../../utils/format';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { PAY_STATUS } from '../../../utils/apPaymentStatus';

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: PAY_STATUS.OVERDUE, label: 'Overdue' },
  { id: PAY_STATUS.UNPAID, label: 'Unpaid' },
  { id: PAY_STATUS.PARTIALLY_PAID, label: 'Partial' },
  { id: PAY_STATUS.PAID, label: 'Paid' },
];

export default function SupplierPaymentsPage() {
  const [dashboard, setDashboard] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState('invoices');
  const [showPayForm, setShowPayForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dash, inv, hist] = await Promise.all([
        fetchApDashboard({ supplier: supplierFilter || undefined }),
        listApInvoices({
          supplier: supplierFilter || undefined,
          status: statusFilter === 'all' ? 'all' : statusFilter,
          limit: 200,
        }),
        listSupplierPaymentHistory({
          supplier: supplierFilter || undefined,
          limit: 30,
        }),
      ]);
      setDashboard(dash);
      setInvoices(inv || []);
      setPayments(hist || []);
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [supplierFilter, statusFilter]);

  useEffect(() => {
    load();
    listSuppliers({ limit: 300 }).then((r) => setSuppliers(r?.data?.data || []));
  }, [load]);

  const filteredCounts = useMemo(() => {
    const c = { all: invoices.length };
    for (const inv of invoices) {
      const k = inv.payment_status || 'unpaid';
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [invoices]);

  const onPaymentSuccess = (result) => {
    setShowPayForm(false);
    setMsg(`Payment ${result.name} submitted — ${fmtCurrency(result.paid_amount)}`);
    load();
  };

  return (
    <TablePageLayout className="ap-payments-page">
      <PageHeader
        title="Supplier payments"
        subtitle="Accounts payable — unpaid invoices, aging, and ERPNext Payment Entry"
        dense
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={load}>
              Refresh
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => setShowPayForm((v) => !v)}>
              {showPayForm ? 'Close form' : 'New payment'}
            </Btn>
          </>
        }
      />

      <div className="ap-workflow-banner" role="note">
        <strong>AP lifecycle:</strong> Purchase Receipt (goods) →{' '}
        <Link to="/admin/purchasing/matching">Invoice matching</Link> → Purchase Invoice →{' '}
        <strong>Supplier payment</strong> (this page). ERPNext posts GL and updates outstanding.
      </div>

      {msg && <p className="inv-success">{msg}</p>}

      {dashboard && (
        <section className="layout-grid layout-grid--kpi" aria-label="AP summary">
          <StatCard
            label="Outstanding"
            value={fmtCurrency(dashboard.amounts?.total_outstanding)}
            icon="💳"
            color="amber"
            compact
          />
          <StatCard
            label="Overdue"
            value={fmtCurrency(dashboard.amounts?.overdue_amount)}
            icon="⚠"
            color="red"
            compact
          />
          <StatCard
            label="Unpaid invoices"
            value={dashboard.counts?.unpaid ?? 0}
            icon="📄"
            color="blue"
            compact
          />
          <StatCard
            label="Overdue count"
            value={dashboard.counts?.overdue ?? 0}
            icon="⏰"
            color="red"
            compact
          />
        </section>
      )}

      {dashboard?.aging && (
        <LayoutSection title="Aging (outstanding)" variant="raised">
          <div className="ap-aging-grid">
            <div>
              <span className="ap-aging-grid__label">Current</span>
              <strong>{fmtCurrency(dashboard.aging.current)}</strong>
            </div>
            <div>
              <span className="ap-aging-grid__label">1–30 days</span>
              <strong>{fmtCurrency(dashboard.aging.days_1_30)}</strong>
            </div>
            <div>
              <span className="ap-aging-grid__label">31–60</span>
              <strong>{fmtCurrency(dashboard.aging.days_31_60)}</strong>
            </div>
            <div>
              <span className="ap-aging-grid__label">61–90</span>
              <strong>{fmtCurrency(dashboard.aging.days_61_90)}</strong>
            </div>
            <div>
              <span className="ap-aging-grid__label">90+</span>
              <strong>{fmtCurrency(dashboard.aging.days_90_plus)}</strong>
            </div>
          </div>
        </LayoutSection>
      )}

      {showPayForm && (
        <LayoutSection title="Record supplier payment" variant="raised">
          <CreateSupplierPaymentPanel
            preselectSupplier={supplierFilter}
            onSuccess={onPaymentSuccess}
            onCancel={() => setShowPayForm(false)}
          />
        </LayoutSection>
      )}

      <div className="ap-payments-toolbar">
        <label>
          Supplier
          <select
            className="input"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.name} value={s.name}>
                {s.supplier_name || s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="ap-payments-tabs" role="tablist">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.id}
              className={`invoice-matching-filters__btn${
                statusFilter === tab.id ? ' invoice-matching-filters__btn--active' : ''
              }`}
              onClick={() => setStatusFilter(tab.id)}
            >
              {tab.label}
              <span className="invoice-matching-filters__count">
                {tab.id === 'all' ? filteredCounts.all : filteredCounts[tab.id] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="ap-payments-view-toggle">
          <Btn
            variant={view === 'invoices' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setView('invoices')}
          >
            Invoices
          </Btn>
          <Btn
            variant={view === 'history' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setView('history')}
          >
            Payment history
          </Btn>
        </div>
      </div>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : view === 'invoices' ? (
        invoices.length === 0 ? (
          <EmptyState icon="🧾" title="No invoices" desc="No purchase invoices match this filter." />
        ) : (
          <LayoutSection variant="raised" flushHead>
            <TableRegion>
              <table className="ap-invoices-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Supplier</th>
                    <th>Due</th>
                    <th>Total</th>
                    <th>Outstanding</th>
                    <th>Paid %</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.name}
                      className={
                        inv.payment_status === PAY_STATUS.OVERDUE ? 'ap-invoices-table__overdue' : ''
                      }
                    >
                      <td className="mono">{inv.name}</td>
                      <td>{inv.supplier_name || inv.supplier}</td>
                      <td>{inv.due_date || '—'}</td>
                      <td>{fmtCurrency(inv.grand_total)}</td>
                      <td>
                        <strong>{fmtCurrency(inv.outstanding_amount)}</strong>
                      </td>
                      <td>{inv.paid_pct != null ? `${inv.paid_pct}%` : '—'}</td>
                      <td>
                        <ApPaymentStatusPill status={inv.payment_status} paidPct={inv.paid_pct} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableRegion>
          </LayoutSection>
        )
      ) : payments.length === 0 ? (
        <EmptyState icon="💰" title="No payments" desc="Submitted supplier payments will appear here." />
      ) : (
        <LayoutSection variant="raised" flushHead>
          <ul className="ap-payment-history">
            {payments.map((pe) => (
              <li key={pe.name} className="ap-payment-history__item">
                <span className="mono">{pe.name}</span>
                <span>{pe.party}</span>
                <span>{pe.posting_date}</span>
                <strong>{fmtCurrency(pe.paid_amount)}</strong>
                <span className="page-header__sub">{pe.paid_from}</span>
                {pe.references?.length > 0 && (
                  <span className="page-header__sub">
                    → {pe.references.map((r) => r.reference_name).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}
