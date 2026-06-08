/**
 * /finance/top-suppliers — supplier analytics report.
 *
 * Columns: Supplier · Purchase amount · Outstanding · Invoice count ·
 * Last purchase date. Sortable by clicking the column header.
 *
 * Backed by elmahdi.api.accounts_payable.get_top_suppliers_report.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiErrorCard,
  Btn,
  EmptyState,
  PageHeader,
  PageLoading,
} from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { fetchTopSuppliersReport } from '../../../services/accountsPayableService';
import { fmtCurrency, fmtDate } from '../../../utils/format';
import { exportTable } from '../../../utils/export';
import { printReportPdf } from '../../../utils/printErpFormat';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 180);
  return d.toISOString().slice(0, 10);
}

export default function TopSuppliersPage() {
  const { t } = useTranslation();
  const [fromDate, setFromDate] = useState(defaultFromDate());
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('purchase_amount');
  const [sortDir, setSortDir] = useState('desc');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchTopSuppliersReport({ fromDate, toDate, limit: 200 });
      setData(res || null);
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const all = data?.rows || [];
    const filtered = all.filter((r) => {
      if (!search.trim()) return true;
      return (r.supplier_name || r.supplier || '').toLowerCase().includes(search.toLowerCase());
    });
    return [...filtered].sort((a, b) => {
      const av = a[sortBy] ?? 0;
      const bv = b[sortBy] ?? 0;
      const ax = typeof av === 'string' ? av : Number(av) || 0;
      const bx = typeof bv === 'string' ? bv : Number(bv) || 0;
      if (ax < bx) return sortDir === 'asc' ? -1 : 1;
      if (ax > bx) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, search, sortBy, sortDir]);

  const headerClick = (key) => {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortDir('desc'); }
  };

  const exportColumns = [
    { key: 'supplier_name',     label: t('finance.top.col.supplier', { defaultValue: 'Supplier' }) },
    { key: 'purchase_amount',   label: t('finance.top.col.purchase', { defaultValue: 'Purchase amount' }), export: (r) => r.purchase_amount },
    { key: 'outstanding',       label: t('finance.top.col.outstanding', { defaultValue: 'Outstanding' }), export: (r) => r.outstanding },
    { key: 'invoice_count',     label: t('finance.top.col.count', { defaultValue: 'Invoice count' }), export: (r) => r.invoice_count },
    { key: 'last_purchase_date', label: t('finance.top.col.lastPurchase', { defaultValue: 'Last purchase' }) },
  ];

  const doExport = (format) => {
    if (format === 'pdf') {
      printReportPdf('top_suppliers', { from_date: fromDate, to_date: toDate });
      return;
    }
    return exportTable({
      format,
      filename: `top-suppliers-${fromDate}-${toDate}`,
      columns: exportColumns,
      rows,
      title: t('finance.top.title', { defaultValue: 'Top Suppliers' }),
      elementId: 'top-suppliers-table',
    });
  };

  return (
    <TablePageLayout>
      <PageHeader
        title={t('finance.top.title', { defaultValue: 'Top Suppliers' })}
        subtitle={t('finance.top.subtitle', {
          defaultValue: 'Ranked by total purchases between {{from}} and {{to}}',
          from: fromDate, to: toDate,
        })}
        dense
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={() => doExport('csv')}>CSV</Btn>
            <Btn variant="ghost" size="sm" onClick={() => doExport('excel')}>Excel</Btn>
            <Btn variant="ghost" size="sm" onClick={() => doExport('pdf')}>PDF</Btn>
            <Btn variant="ghost" size="sm" onClick={load}>{t('common.refresh', { defaultValue: 'Refresh' })}</Btn>
          </>
        }
      />

      <LayoutSection variant="flat" flushHead>
        <div className="payment-history-filters">
          <input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="From" />
          <input type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="To" />
          <input
            type="search"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('finance.aging.searchPlaceholder', { defaultValue: 'Search supplier…' })}
          />
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="📊"
          title={t('finance.top.empty', { defaultValue: 'No purchases in this range' })}
        />
      ) : (
        <LayoutSection variant="raised" flushHead>
          <TableRegion>
            <div className="table-wrap" id="top-suppliers-table">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>
                      <button type="button" className="th-sort" onClick={() => headerClick('supplier_name')}>
                        {t('finance.top.col.supplier', { defaultValue: 'Supplier' })}
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="th-sort" onClick={() => headerClick('purchase_amount')}>
                        {t('finance.top.col.purchase', { defaultValue: 'Purchase amount' })}
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="th-sort" onClick={() => headerClick('outstanding')}>
                        {t('finance.top.col.outstanding', { defaultValue: 'Outstanding' })}
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="th-sort" onClick={() => headerClick('invoice_count')}>
                        {t('finance.top.col.count', { defaultValue: 'Invoice count' })}
                      </button>
                    </th>
                    <th>
                      <button type="button" className="th-sort" onClick={() => headerClick('last_purchase_date')}>
                        {t('finance.top.col.lastPurchase', { defaultValue: 'Last purchase' })}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.supplier}>
                      <td>{r.supplier_name || r.supplier}</td>
                      <td className="num"><strong>{fmtCurrency(r.purchase_amount)}</strong></td>
                      <td className="num">
                        <span style={{ color: r.outstanding > 0 ? 'var(--amber, #b88408)' : undefined }}>
                          {fmtCurrency(r.outstanding)}
                        </span>
                      </td>
                      <td className="num">{r.invoice_count}</td>
                      <td>{r.last_purchase_date ? fmtDate(r.last_purchase_date) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableRegion>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}
