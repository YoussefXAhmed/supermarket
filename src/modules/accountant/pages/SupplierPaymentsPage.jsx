import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { financePath } from '../../../utils/workspacePaths';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { useNotify } from '../../../context/NotificationContext';
import { PAY_STATUS } from '../../../utils/apPaymentStatus';

const STATUS_TABS = [
  { id: 'all', labelKey: 'finance.status.all' },
  { id: PAY_STATUS.OVERDUE, labelKey: 'finance.status.overdue' },
  { id: PAY_STATUS.UNPAID, labelKey: 'finance.status.unpaid' },
  { id: PAY_STATUS.PARTIALLY_PAID, labelKey: 'finance.status.partial' },
  { id: PAY_STATUS.PAID, labelKey: 'finance.status.paid' },
];

export default function SupplierPaymentsPage() {
  const { t } = useTranslation();
  const notify = useNotify();
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
    notify.success(`Supplier payment ${result.name} recorded — ${fmtCurrency(result.paid_amount)}`);
    load();
  };

  return (
    <TablePageLayout className="ap-payments-page">
      <PageHeader
        title={t('nav.supplierPayments')}
        subtitle={t('finance.payments.subtitle')}
        dense
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={load}>
              {t('common.refresh')}
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => setShowPayForm((v) => !v)}>
              {showPayForm ? t('finance.payments.closeForm') : t('finance.payments.newPayment')}
            </Btn>
          </>
        }
      />

      <div className="ap-workflow-banner" role="note">
        <strong>Payables lifecycle:</strong> Goods Receipt →{' '}
        <Link to={financePath('matching')}>Match supplier bill</Link> → Supplier bill →{' '}
        <strong>Supplier payment</strong> (this page). The system posts accounting entries and updates the bill balance.
      </div>

      {dashboard && (
        <section className="layout-grid layout-grid--kpi" aria-label="AP summary">
          <StatCard
            label={t('finance.outstanding')}
            value={fmtCurrency(dashboard.amounts?.total_outstanding)}
            icon="💳"
            color="amber"
            compact
          />
          <StatCard
            label={t('finance.status.overdue')}
            value={fmtCurrency(dashboard.amounts?.overdue_amount)}
            icon="⚠"
            color="red"
            compact
          />
          <StatCard
            label={t('finance.unpaidInvoices')}
            value={dashboard.counts?.unpaid ?? 0}
            icon="📄"
            color="blue"
            compact
          />
          <StatCard
            label={t('finance.overdueCount')}
            value={dashboard.counts?.overdue ?? 0}
            icon="⏰"
            color="red"
            compact
          />
        </section>
      )}

      {dashboard?.aging && (
        <LayoutSection title={t('finance.agingTitle')} variant="raised">
          <div className="ap-aging-grid">
            <div>
              <span className="ap-aging-grid__label">{t('finance.aging.current')}</span>
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
        <LayoutSection title={t('finance.payments.recordPayment')} variant="raised">
          <CreateSupplierPaymentPanel
            preselectSupplier={supplierFilter}
            onSuccess={onPaymentSuccess}
            onCancel={() => setShowPayForm(false)}
          />
        </LayoutSection>
      )}

      <div className="ap-payments-toolbar">
        <label>
          {t('nav.suppliers')}
          <select
            className="input"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
          >
            <option value="">{t('finance.payments.allSuppliers')}</option>
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
              {t(tab.labelKey)}
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
            {t('common.invoices')}
          </Btn>
          <Btn
            variant={view === 'history' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setView('history')}
          >
            {t('finance.payments.history')}
          </Btn>
        </div>
      </div>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : view === 'invoices' ? (
        invoices.length === 0 ? (
          <EmptyState icon="🧾" title={t('finance.payments.noInvoices')} desc={t('finance.payments.noInvoicesDesc')} />
        ) : (
          <LayoutSection variant="raised" flushHead>
            <TableRegion>
              <div className="table-wrap">
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th scope="col">{t('finance.table.invoice')}</th>
                      <th scope="col">{t('nav.suppliers')}</th>
                      <th scope="col">{t('finance.table.due')}</th>
                      <th scope="col" className="num">{t('finance.table.total')}</th>
                      <th scope="col" className="num">{t('finance.outstanding')}</th>
                      <th scope="col" className="num">{t('finance.table.paidPct')}</th>
                      <th scope="col">{t('finance.table.status')}</th>
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
                        <td className="num">{fmtCurrency(inv.grand_total)}</td>
                        <td className="num">
                          <strong>{fmtCurrency(inv.outstanding_amount)}</strong>
                        </td>
                        <td className="num">{inv.paid_pct != null ? `${inv.paid_pct}%` : '—'}</td>
                        <td>
                          <ApPaymentStatusPill status={inv.payment_status} paidPct={inv.paid_pct} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TableRegion>
          </LayoutSection>
        )
      ) : payments.length === 0 ? (
        <EmptyState icon="💰" title={t('finance.payments.noPayments')} desc={t('finance.payments.noPaymentsDesc')} />
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
