/**
 * Payment History — filterable, exportable table.
 *
 * Filters: date range, supplier substring, branch (paid_from account
 * substring), payment method, status (submitted/cancelled).
 *
 * Exports: CSV, Excel, PDF via the shared exportTable() utility.
 *
 * Click a row's "View voucher" action to open PaymentVoucherModal.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, EmptyState } from '../ui';
import { LayoutSection, TableRegion } from '../layout/page-layouts';
import { fmtCurrency } from '../../utils/format';
import { exportTable } from '../../utils/export';

export default function PaymentHistorySection({ payments = [], onOpenVoucher }) {
  const { t } = useTranslation();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const allMethods = useMemo(() => {
    const set = new Set();
    payments.forEach((p) => { if (p.mode_of_payment) set.add(p.mode_of_payment); });
    return [...set].sort();
  }, [payments]);

  const filtered = useMemo(() => payments.filter((p) => {
    if (fromDate && p.posting_date < fromDate) return false;
    if (toDate && p.posting_date > toDate) return false;
    if (supplierFilter && !(p.party || '').toLowerCase().includes(supplierFilter.toLowerCase())) return false;
    if (branchFilter && !(p.paid_from || '').toLowerCase().includes(branchFilter.toLowerCase())) return false;
    if (methodFilter !== 'all' && p.mode_of_payment !== methodFilter) return false;
    if (statusFilter !== 'all') {
      const isSubmitted = p.docstatus === 1;
      if (statusFilter === 'submitted' && !isSubmitted) return false;
      if (statusFilter === 'cancelled' && p.docstatus !== 2) return false;
    }
    return true;
  }), [payments, fromDate, toDate, supplierFilter, branchFilter, methodFilter, statusFilter]);

  const exportColumns = [
    { key: 'name',           label: t('finance.history.col.voucher', { defaultValue: 'Voucher' }) },
    { key: 'party',          label: t('finance.history.col.supplier', { defaultValue: 'Supplier' }) },
    { key: 'invoices',       label: t('finance.history.col.invoice', { defaultValue: 'Invoice(s)' }),
      export: (r) => (r.references || []).map((x) => x.reference_name).join('; ') },
    { key: 'paid_from',      label: t('finance.history.col.branch', { defaultValue: 'Paid from' }) },
    { key: 'mode_of_payment', label: t('finance.history.col.method', { defaultValue: 'Method' }) },
    { key: 'paid_amount',    label: t('finance.history.col.amount', { defaultValue: 'Amount' }),
      export: (r) => r.paid_amount },
    { key: 'posting_date',   label: t('finance.history.col.date', { defaultValue: 'Date' }) },
    { key: 'owner',          label: t('finance.history.col.user', { defaultValue: 'User' }) },
    { key: 'docstatus',      label: t('finance.history.col.status', { defaultValue: 'Status' }),
      export: (r) => (r.docstatus === 1 ? 'Submitted' : r.docstatus === 2 ? 'Cancelled' : 'Draft') },
  ];

  const doExport = (format) => {
    exportTable({
      format,
      filename: `supplier-payments-${new Date().toISOString().slice(0, 10)}`,
      columns: exportColumns,
      rows: filtered,
      title: t('finance.payments.history', { defaultValue: 'Payment history' }),
      elementId: 'payment-history-table',
    });
  };

  return (
    <>
      <LayoutSection variant="flat" flushHead>
        <div className="payment-history-filters">
          <input
            type="date"
            className="input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            aria-label={t('finance.history.fromDate', { defaultValue: 'From date' })}
          />
          <input
            type="date"
            className="input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            aria-label={t('finance.history.toDate', { defaultValue: 'To date' })}
          />
          <input
            type="search"
            className="input"
            placeholder={t('finance.history.supplierSearch', { defaultValue: 'Supplier' })}
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
          />
          <input
            type="search"
            className="input"
            placeholder={t('finance.history.branchSearch', { defaultValue: 'Paid from' })}
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          />
          <select
            className="input"
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            aria-label={t('finance.history.method', { defaultValue: 'Method' })}
          >
            <option value="all">{t('finance.history.allMethods', { defaultValue: 'All methods' })}</option>
            {allMethods.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t('finance.history.status', { defaultValue: 'Status' })}
          >
            <option value="all">{t('finance.history.allStatuses', { defaultValue: 'All statuses' })}</option>
            <option value="submitted">{t('finance.history.submitted', { defaultValue: 'Submitted' })}</option>
            <option value="cancelled">{t('finance.history.cancelled', { defaultValue: 'Cancelled' })}</option>
          </select>
          <div className="payment-history-filters__exports">
            <Btn variant="ghost" size="sm" onClick={() => doExport('csv')}>CSV</Btn>
            <Btn variant="ghost" size="sm" onClick={() => doExport('excel')}>Excel</Btn>
            <Btn variant="ghost" size="sm" onClick={() => doExport('pdf')}>PDF</Btn>
          </div>
        </div>
      </LayoutSection>

      {filtered.length === 0 ? (
        <EmptyState
          icon="💰"
          title={t('finance.payments.noPayments', { defaultValue: 'No payments' })}
          desc={t('finance.payments.noPaymentsDesc', { defaultValue: 'Submitted supplier payments will appear here.' })}
        />
      ) : (
        <LayoutSection variant="raised" flushHead>
          <TableRegion>
            <div className="table-wrap" id="payment-history-table">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>{t('finance.history.col.voucher', { defaultValue: 'Voucher' })}</th>
                    <th>{t('finance.history.col.supplier', { defaultValue: 'Supplier' })}</th>
                    <th>{t('finance.history.col.invoice', { defaultValue: 'Invoice(s)' })}</th>
                    <th>{t('finance.history.col.branch', { defaultValue: 'Paid from' })}</th>
                    <th>{t('finance.history.col.method', { defaultValue: 'Method' })}</th>
                    <th className="num">{t('finance.history.col.amount', { defaultValue: 'Amount' })}</th>
                    <th>{t('finance.history.col.date', { defaultValue: 'Date' })}</th>
                    <th>{t('finance.history.col.user', { defaultValue: 'User' })}</th>
                    <th>{t('finance.history.col.status', { defaultValue: 'Status' })}</th>
                    <th>{t('finance.history.col.actions', { defaultValue: 'Actions' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pe) => (
                    <tr key={pe.name}>
                      <td className="mono">{pe.name}</td>
                      <td>{pe.party}</td>
                      <td className="mono" style={{ fontSize: '0.76rem' }}>
                        {(pe.references || []).map((r) => r.reference_name).join(', ') || '—'}
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>{pe.paid_from || '—'}</td>
                      <td>{pe.mode_of_payment || '—'}</td>
                      <td className="num"><strong>{fmtCurrency(pe.paid_amount)}</strong></td>
                      <td>{pe.posting_date}</td>
                      <td>{pe.owner}</td>
                      <td>
                        {pe.docstatus === 1
                          ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>{t('finance.history.submitted', { defaultValue: 'Submitted' })}</span>
                          : pe.docstatus === 2
                            ? <span style={{ color: 'var(--red)' }}>{t('finance.history.cancelled', { defaultValue: 'Cancelled' })}</span>
                            : <span>{t('status.draft', { defaultValue: 'Draft' })}</span>}
                      </td>
                      <td>
                        <Btn variant="ghost" size="sm" onClick={() => onOpenVoucher?.(pe.name)}>
                          {t('finance.voucher.view', { defaultValue: 'Voucher' })}
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableRegion>
        </LayoutSection>
      )}
    </>
  );
}
