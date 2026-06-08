/**
 * /finance/aging — Accounts Payable Aging report (per supplier).
 *
 * One row per supplier with outstanding balance bucketed into:
 *   Current · 1-30 · 31-60 · 61-90 · 90+
 *
 * The footer totals row sums each bucket. Backed by
 * elmahdi.api.accounts_payable.get_ap_aging_by_supplier.
 *
 * Exports: CSV / Excel / PDF.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiErrorCard,
  Btn,
  EmptyState,
  PageHeader,
  PageLoading,
} from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { fetchApAgingBySupplier } from '../../../services/accountsPayableService';
import { fmtCurrency } from '../../../utils/format';
import { exportTable } from '../../../utils/export';
import { printReportPdf } from '../../../utils/printErpFormat';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

export default function ApAgingPage() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApAgingBySupplier({});
      setData(res || null);
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = (data?.rows || []).filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (r.supplier_name || r.supplier || '').toLowerCase().includes(q);
  });
  const totals = data?.totals || {
    current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 0,
  };

  const exportColumns = [
    { key: 'supplier_name', label: t('finance.aging.col.supplier', { defaultValue: 'Supplier' }) },
    { key: 'current',       label: t('finance.aging.col.current', { defaultValue: 'Current' }), export: (r) => r.current },
    { key: 'days_1_30',     label: '1–30',  export: (r) => r.days_1_30 },
    { key: 'days_31_60',    label: '31–60', export: (r) => r.days_31_60 },
    { key: 'days_61_90',    label: '61–90', export: (r) => r.days_61_90 },
    { key: 'days_90_plus',  label: '90+',   export: (r) => r.days_90_plus },
    { key: 'total',         label: t('finance.aging.col.total', { defaultValue: 'Total outstanding' }), export: (r) => r.total },
  ];

  const doExport = (format) => {
    if (format === 'pdf') {
      printReportPdf('ap_aging', {});
      return;
    }
    exportTable({
      format,
      filename: `ap-aging-${(data?.as_of || '')}`,
      columns: exportColumns,
      rows,
      title: t('finance.aging.title', { defaultValue: 'Accounts Payable Aging' }),
      elementId: 'aging-table',
    });
  };

  return (
    <TablePageLayout>
      <PageHeader
        title={t('finance.aging.title', { defaultValue: 'Accounts Payable Aging' })}
        subtitle={t('finance.aging.subtitle', {
          defaultValue: 'Outstanding balance by supplier and bucket — as of {{date}}.',
          date: data?.as_of || '',
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
        <input
          type="search"
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('finance.aging.searchPlaceholder', { defaultValue: 'Search supplier…' })}
          style={{ maxWidth: 320 }}
        />
      </LayoutSection>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="✓"
          title={t('finance.aging.empty', { defaultValue: 'No outstanding payables' })}
          desc={t('finance.aging.emptyDesc', { defaultValue: 'All supplier invoices are paid.' })}
        />
      ) : (
        <LayoutSection variant="raised" flushHead>
          <TableRegion>
            <div className="table-wrap" id="aging-table">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>{t('finance.aging.col.supplier', { defaultValue: 'Supplier' })}</th>
                    <th className="num">{t('finance.aging.col.current', { defaultValue: 'Current' })}</th>
                    <th className="num">1–30</th>
                    <th className="num">31–60</th>
                    <th className="num">61–90</th>
                    <th className="num">90+</th>
                    <th className="num">{t('finance.aging.col.total', { defaultValue: 'Total outstanding' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.supplier}>
                      <td>
                        <div>{r.supplier_name || r.supplier}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                          {t('finance.aging.invoiceCount', {
                            defaultValue: '{{n}} open invoice(s)',
                            n: r.invoice_count,
                          })}
                        </div>
                      </td>
                      <td className="num">{r.current > 0 ? fmtCurrency(r.current) : '—'}</td>
                      <td className="num">{r.days_1_30 > 0 ? fmtCurrency(r.days_1_30) : '—'}</td>
                      <td className="num">{r.days_31_60 > 0 ? fmtCurrency(r.days_31_60) : '—'}</td>
                      <td className="num" style={{ color: r.days_61_90 > 0 ? 'var(--amber, #b88408)' : undefined }}>
                        {r.days_61_90 > 0 ? fmtCurrency(r.days_61_90) : '—'}
                      </td>
                      <td className="num" style={{ color: r.days_90_plus > 0 ? 'var(--red)' : undefined }}>
                        {r.days_90_plus > 0 ? fmtCurrency(r.days_90_plus) : '—'}
                      </td>
                      <td className="num"><strong>{fmtCurrency(r.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="num"><strong>{t('finance.aging.totalsRow', { defaultValue: 'Totals' })}</strong></td>
                    <td className="num"><strong>{fmtCurrency(totals.current)}</strong></td>
                    <td className="num"><strong>{fmtCurrency(totals.days_1_30)}</strong></td>
                    <td className="num"><strong>{fmtCurrency(totals.days_31_60)}</strong></td>
                    <td className="num"><strong>{fmtCurrency(totals.days_61_90)}</strong></td>
                    <td className="num"><strong>{fmtCurrency(totals.days_90_plus)}</strong></td>
                    <td className="num"><strong>{fmtCurrency(totals.total)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </TableRegion>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}
