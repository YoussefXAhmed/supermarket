import { useEffect, useState, useCallback } from 'react';
import { PageHeader, PageLoading, ApiErrorCard, PaginatedTable, Btn, PartialDataBanner, ExportToolbar } from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { getPurchaseHistoryReport } from '../../services/purchasingService';
import { listSuppliers } from '../../services/purchasingApi';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { useOperationalRefresh } from '../../services/operationalRefresh';
import StatusPill from '../../components/approvals/StatusPill';
import { purchaseReceiptApprovalStatus, isPendingPurchaseStatus } from '../../utils/approvalStatuses';
import { fmtCurrency, fmtCurrencyCompact } from '../../utils/format';

const EXPORT_COLUMNS = [
  { key: 'doc_type', label: 'Type' },
  { key: 'name', label: 'Document' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'posting_date', label: 'Date' },
  { key: 'grand_total', label: 'Total', export: (r) => r.grand_total },
];

export default function PurchaseReportsPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [supplier, setSupplier] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [rows, setRows] = useState([]);
  const [costTrend, setCostTrend] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    listSuppliers({ limit: 300 }).then((r) => setSuppliers(r?.data?.data || []));
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    setFromDate(d.toISOString().slice(0, 10));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getPurchaseHistoryReport({
      supplier: supplier || undefined,
      fromDate: fromDate || undefined,
    })
      .then((data) => {
        setRows(data.rows);
        setCostTrend(data.costTrend);
        setWarnings(data.warnings || []);
        setError('');
      })
      .catch((e) => {
        setRows([]);
        setCostTrend([]);
        setWarnings([]);
        setError(getUserFriendlyMessage(e));
      })
      .finally(() => setLoading(false));
  }, [supplier, fromDate]);

  useEffect(() => {
    if (fromDate) load();
  }, [fromDate, load]);

  useOperationalRefresh(load, [load]);

  const columns = [
    { key: 'doc_type', label: 'Type' },
    { key: 'name', label: 'Document', render: (v) => <span className="mono">{v}</span> },
    { key: 'supplier', label: 'Supplier' },
    { key: 'posting_date', label: 'Date' },
    { key: 'grand_total', label: 'Amount', render: (v) => fmtCurrency(v) },
    {
      key: 'status',
      label: 'Status',
      render: (v, row) =>
        row.doc_type === 'Purchase Receipt' && isPendingPurchaseStatus(purchaseReceiptApprovalStatus(row)) ? (
          <StatusPill status={purchaseReceiptApprovalStatus(row)} label={v} />
        ) : (
          v || '—'
        ),
    },
  ];

  const sparse = rows.length > 0 && rows.length <= 10;

  return (
    <TablePageLayout tableConstrain={sparse}>
      <PageHeader
        title="Purchase reports"
        subtitle="History & cost trends"
        dense
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={load}>Load</Btn>
            <ExportToolbar
              filename="purchase-history"
              title="Purchase History"
              columns={EXPORT_COLUMNS}
              rows={rows}
              elementId="purchase-report-print"
              disabled={!rows.length}
            />
          </>
        }
      />

      <PartialDataBanner warnings={warnings} />

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar__group">
          <select className="input toolbar__input-fixed" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => <option key={s.name} value={s.name}>{s.supplier_name || s.name}</option>)}
          </select>
          <input className="input toolbar__input-fixed" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={24} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : (
        <div id="purchase-report-print" className="analytics-layout__main">
          {costTrend.length > 0 && (
            <LayoutSection title="Cost trend" subtitle="Purchase invoices by month" variant="raised">
              <div className="value-trend">
                {costTrend.map((point) => {
                  const maxVal = Math.max(...costTrend.map((p) => p.value), 1);
                  const pct = Math.min(100, (point.value / maxVal) * 100);
                  return (
                    <div key={point.month} className="value-trend__bar-wrap" title={`${point.month}: ${fmtCurrencyCompact(point.value)}`}>
                      <div className="value-trend__bar" style={{ height: `${pct}%` }} />
                      <span className="value-trend__label">{point.month}</span>
                    </div>
                  );
                })}
              </div>
            </LayoutSection>
          )}
          <LayoutSection
            title="Purchase history"
            subtitle={rows.length ? `${rows.length} documents` : 'Run Load to fetch data'}
            variant="raised"
            fit={sparse}
          >
            {rows.length === 0 ? (
              <p className="empty-inline">No data loaded. Choose filters and click Load.</p>
            ) : (
              <PaginatedTable
                columns={columns}
                data={rows}
                pageSize={20}
                compact
                emptyMsg="No documents"
                rowKey={(r) => `${r.doc_type}-${r.name}`}
              />
            )}
          </LayoutSection>
        </div>
      )}
    </TablePageLayout>
  );
}
