import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, PageLoading, ApiErrorCard, PaginatedTable, Btn, PartialDataBanner, ExportToolbar } from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { getPurchaseHistoryReport } from '../../services/purchasingService';
import { listSuppliers } from '../../services/purchasingApi';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { useOperationalRefresh } from '../../services/operationalRefresh';
import StatusPill from '../../components/approvals/StatusPill';
import { purchaseReceiptApprovalStatus, isPendingPurchaseStatus } from '../../utils/approvalStatuses';
import { fmtCurrency, fmtCurrencyCompact } from '../../utils/format';

export default function PurchaseReportsPage() {
  const { t } = useTranslation();

  const EXPORT_COLUMNS = [
    { key: 'doc_type', label: t('purchasing.reports.type') },
    { key: 'name', label: t('purchasing.reports.document') },
    { key: 'supplier', label: t('purchasing.reports.supplier') },
    { key: 'posting_date', label: t('purchasing.reports.date') },
    { key: 'grand_total', label: t('purchasing.reports.amount'), export: (r) => r.grand_total },
  ];

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
    { key: 'doc_type', label: t('purchasing.reports.type') },
    { key: 'name', label: t('purchasing.reports.document'), render: (v) => <span className="mono">{v}</span> },
    { key: 'supplier', label: t('purchasing.reports.supplier') },
    { key: 'posting_date', label: t('purchasing.reports.date') },
    { key: 'grand_total', label: t('purchasing.reports.amount'), render: (v) => fmtCurrency(v) },
    {
      key: 'status',
      label: t('purchasing.reports.status'),
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
        title={t('purchasing.reports.title')}
        subtitle={t('purchasing.reports.subtitle')}
        dense
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={load}>{t('common.load')}</Btn>
            <ExportToolbar
              filename="purchase-history"
              title={t('purchasing.reports.purchaseHistory')}
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
            <option value="">{t('purchasing.reports.allSuppliers')}</option>
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
            <LayoutSection title={t('purchasing.reports.costTrend')} subtitle={t('purchasing.reports.invoicesByMonth')} variant="raised">
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
            title={t('purchasing.reports.purchaseHistory')}
            subtitle={rows.length ? `${rows.length} documents` : t('purchasing.reports.runLoadDesc')}
            variant="raised"
            fit={sparse}
          >
            {rows.length === 0 ? (
              <p className="empty-inline">{t('purchasing.reports.noDataLoaded')}</p>
            ) : (
              <PaginatedTable
                columns={columns}
                data={rows}
                pageSize={20}
                compact
                emptyMsg={t('purchasing.reports.noDocuments')}
                rowKey={(r) => `${r.doc_type}-${r.name}`}
              />
            )}
          </LayoutSection>
        </div>
      )}
    </TablePageLayout>
  );
}
