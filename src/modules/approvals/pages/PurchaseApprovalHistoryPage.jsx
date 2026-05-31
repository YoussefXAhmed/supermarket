import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiErrorCard,
  Btn,
  EmptyState,
  Modal,
  PageHeader,
  PageLoading,
  Pill,
  SearchInput,
  StatCard,
} from '../../../components/ui';
import { DashboardLayout, LayoutSection } from '../../../components/layout/page-layouts';
import {
  listPurchaseApprovalHistory,
  getPurchaseApprovalDetail,
} from '../../../services/purchasingApprovalApi';
import { useAuth } from '../../../hooks/useAuth';
import { fmtCurrency, fmtDate, fmtDateTime } from '../../../utils/format';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import {
  downloadReportCsv,
  downloadReportXlsx,
  downloadReportPdf,
} from '../../../components/reports/reportExport';

const STATUS_OPTIONS = [
  { value: 'all', labelKey: 'history.allDecisions', defaultLabel: 'All decisions' },
  { value: 'approved', labelKey: 'history.approved', defaultLabel: 'Approved' },
  { value: 'rejected', labelKey: 'history.rejected', defaultLabel: 'Rejected' },
];

function decisionTone(decision) {
  if (decision === 'approved') return 'success';
  if (decision === 'rejected') return 'danger';
  return 'default';
}

function buildExportEnvelope(rows, t) {
  return {
    columns: [
      { key: 'name', label: t('history.col.receipt', { defaultValue: 'Purchase Receipt' }), type: 'text' },
      { key: 'supplier_name', label: t('history.col.supplier', { defaultValue: 'Supplier' }), type: 'text' },
      { key: 'grand_total', label: t('history.col.total', { defaultValue: 'Total' }), type: 'currency' },
      { key: 'decision', label: t('history.col.status', { defaultValue: 'Status' }), type: 'text' },
      { key: 'decided_by', label: t('history.col.decidedBy', { defaultValue: 'Decided by' }), type: 'text' },
      { key: 'decided_at', label: t('history.col.decidedAt', { defaultValue: 'Decided at' }), type: 'datetime' },
      { key: 'creation', label: t('history.col.created', { defaultValue: 'Created' }), type: 'datetime' },
    ],
    rows,
  };
}

function DetailModal({ open, onClose, detail, loading, error, t }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={detail ? `${detail.name} — ${detail.supplier?.supplier_name || detail.supplier?.name || ''}` : t('history.detail.title', { defaultValue: 'Purchase details' })}
      size="lg"
    >
      {loading && <PageLoading />}
      {!loading && error && <ApiErrorCard title={t('history.detail.error', { defaultValue: 'Could not load details' })} message={error} />}
      {!loading && !error && detail && (
        <div className="purchase-history-detail">
          <section className="purchase-history-detail__meta">
            <div>
              <h3>{t('history.detail.receiptInfo', { defaultValue: 'Receipt information' })}</h3>
              <dl className="kv">
                <dt>{t('history.col.receipt', { defaultValue: 'Purchase Receipt' })}</dt><dd className="mono">{detail.name}</dd>
                <dt>{t('history.col.created', { defaultValue: 'Created' })}</dt><dd>{fmtDateTime(detail.creation)}</dd>
                <dt>{t('history.col.posting', { defaultValue: 'Posting date' })}</dt><dd>{fmtDate(detail.posting_date)}</dd>
                <dt>{t('history.col.warehouse', { defaultValue: 'Warehouse' })}</dt><dd>{detail.warehouse || '—'}</dd>
                <dt>{t('history.col.total', { defaultValue: 'Total' })}</dt><dd>{fmtCurrency(detail.grand_total, { currency: detail.currency })}</dd>
              </dl>
            </div>
            <div>
              <h3>{t('history.detail.supplierInfo', { defaultValue: 'Supplier information' })}</h3>
              <dl className="kv">
                <dt>{t('history.col.supplier', { defaultValue: 'Supplier' })}</dt><dd>{detail.supplier?.supplier_name || '—'}</dd>
                <dt>{t('history.col.supplierCode', { defaultValue: 'Code' })}</dt><dd className="mono">{detail.supplier?.name || '—'}</dd>
                {detail.supplier?.email_id && (
                  <>
                    <dt>{t('history.col.email', { defaultValue: 'Email' })}</dt>
                    <dd>{detail.supplier.email_id}</dd>
                  </>
                )}
                {detail.supplier?.mobile_no && (
                  <>
                    <dt>{t('history.col.phone', { defaultValue: 'Phone' })}</dt>
                    <dd>{detail.supplier.mobile_no}</dd>
                  </>
                )}
              </dl>
            </div>
            <div>
              <h3>{t('history.detail.decisionInfo', { defaultValue: 'Decision' })}</h3>
              <dl className="kv">
                <dt>{t('history.col.status', { defaultValue: 'Status' })}</dt>
                <dd><Pill tone={decisionTone(detail.decision)}>{detail.decision}</Pill></dd>
                <dt>{t('history.col.decidedBy', { defaultValue: 'Decided by' })}</dt><dd>{detail.decided_by || '—'}</dd>
                <dt>{t('history.col.decidedAt', { defaultValue: 'Decided at' })}</dt><dd>{detail.decided_at ? fmtDateTime(detail.decided_at) : '—'}</dd>
                {detail.decision_notes && (
                  <>
                    <dt>{t('history.col.notes', { defaultValue: 'Notes' })}</dt>
                    <dd className="purchase-history-detail__notes">{detail.decision_notes}</dd>
                  </>
                )}
              </dl>
            </div>
          </section>

          <section>
            <h3>{t('history.detail.items', { defaultValue: 'Items' })}</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('history.detail.item', { defaultValue: 'Item' })}</th>
                  <th className="num">{t('history.detail.qty', { defaultValue: 'Qty' })}</th>
                  <th>{t('history.detail.uom', { defaultValue: 'UOM' })}</th>
                  <th className="num">{t('history.detail.rate', { defaultValue: 'Rate' })}</th>
                  <th className="num">{t('history.detail.amount', { defaultValue: 'Amount' })}</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((item, idx) => (
                  <tr key={`${item.item_code}-${idx}`}>
                    <td><div className="mono">{item.item_code}</div><div>{item.item_name}</div></td>
                    <td className="num">{item.qty}</td>
                    <td>{item.uom}</td>
                    <td className="num">{fmtCurrency(item.rate, { currency: detail.currency })}</td>
                    <td className="num">{fmtCurrency(item.amount, { currency: detail.currency })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="num"><strong>{t('history.detail.total', { defaultValue: 'Total' })}</strong></td>
                  <td className="num"><strong>{fmtCurrency(detail.grand_total, { currency: detail.currency })}</strong></td>
                </tr>
              </tfoot>
            </table>
          </section>

          {detail.events?.length > 0 && (
            <section>
              <h3>{t('history.detail.audit', { defaultValue: 'Audit trail' })}</h3>
              <ul className="purchase-history-detail__events">
                {detail.events.map((evt, idx) => (
                  <li key={`${evt.at}-${idx}`}>
                    <span className="mono">{fmtDateTime(evt.at)}</span>{' '}
                    <Pill tone={evt.action === 'rejected' ? 'danger' : 'success'}>{evt.action}</Pill>{' '}
                    <span>{evt.user}</span>
                    {evt.notes && <p>{evt.notes}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function PurchaseApprovalHistoryPage() {
  const { t } = useTranslation();
  const { capabilities } = useAuth();
  const [data, setData] = useState({
    rows: [],
    totals: { approved_count: 0, rejected_count: 0, approved_value: 0, rejected_value: 0 },
    month_totals: { approved_count: 0, rejected_count: 0, approved_value: 0, rejected_value: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({
    status: 'all',
    supplier: '',
    fromDate: '',
    toDate: '',
    name: '',
  });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const canView = Boolean(capabilities?.canViewPurchaseApprovals || capabilities?.canManageSystem);

  const reload = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const res = await listPurchaseApprovalHistory(filters);
      setData(res);
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [canView, filters]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openDetail = useCallback(async (name) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    setDetailError('');
    try {
      const d = await getPurchaseApprovalDetail(name);
      setDetail(d);
    } catch (e) {
      setDetailError(getUserFriendlyMessage(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetail(null);
    setDetailError('');
  }, []);

  const exportContext = useMemo(
    () => ({
      title: t('history.title', { defaultValue: 'Purchase Approval History' }),
      subtitle: t('history.subtitle', { defaultValue: 'Approved and rejected purchase receipts' }),
      filters: {
        Status: filters.status,
        Supplier: filters.supplier,
        From: filters.fromDate,
        To: filters.toDate,
      },
    }),
    [filters, t],
  );

  const envelope = useMemo(() => buildExportEnvelope(data.rows, t), [data.rows, t]);

  const onCsv = useCallback(() => downloadReportCsv(envelope, exportContext), [envelope, exportContext]);
  const onXlsx = useCallback(() => downloadReportXlsx(envelope, exportContext), [envelope, exportContext]);
  const onPdf = useCallback(() => downloadReportPdf(envelope, exportContext), [envelope, exportContext]);
  const onPrint = useCallback(() => window.print(), []);

  if (!canView) {
    return (
      <DashboardLayout>
        <PageHeader title={t('history.title', { defaultValue: 'Purchase Approval History' })} subtitle={t('common.accessDenied')} dense />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('history.title', { defaultValue: 'Purchase Approval History' })}
        subtitle={t('history.subtitle', { defaultValue: 'Approved and rejected purchase receipts' })}
        dense
        actions={(
          <div className="page-header__actions">
            <Btn variant="ghost" size="sm" onClick={reload}>{t('common.refresh', { defaultValue: 'Refresh' })}</Btn>
            <Btn variant="ghost" size="sm" onClick={onPrint}>{t('history.print', { defaultValue: 'Print' })}</Btn>
            <Btn variant="ghost" size="sm" onClick={onCsv}>{t('history.csv', { defaultValue: 'CSV' })}</Btn>
            <Btn variant="ghost" size="sm" onClick={onXlsx}>{t('history.xlsx', { defaultValue: 'Excel' })}</Btn>
            <Btn variant="primary" size="sm" onClick={onPdf}>{t('history.pdf', { defaultValue: 'PDF' })}</Btn>
          </div>
        )}
      />

      <section className="layout-grid layout-grid--kpi" aria-label={t('history.kpis', { defaultValue: 'Approval KPIs' })}>
        <StatCard label={t('history.kpi.approvedMonth', { defaultValue: 'Approved this month' })} value={data.month_totals.approved_count} icon="✓" color="emerald" compact />
        <StatCard label={t('history.kpi.rejectedMonth', { defaultValue: 'Rejected this month' })} value={data.month_totals.rejected_count} icon="✕" color="red" compact />
        <StatCard label={t('history.kpi.approvedValue', { defaultValue: 'Total approved value' })} value={fmtCurrency(data.totals.approved_value)} icon="₤" color="emerald" compact />
        <StatCard label={t('history.kpi.rejectedValue', { defaultValue: 'Total rejected value' })} value={fmtCurrency(data.totals.rejected_value)} icon="₤" color="red" compact />
      </section>

      <LayoutSection variant="flat">
        <div className="filter-bar">
          <label className="filter-bar__field">
            <span>{t('history.filter.status', { defaultValue: 'Status' })}</span>
            <select
              className="input"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey, { defaultValue: opt.defaultLabel })}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-bar__field">
            <span>{t('history.filter.supplier', { defaultValue: 'Supplier' })}</span>
            <input
              className="input"
              value={filters.supplier}
              onChange={(e) => setFilters((f) => ({ ...f, supplier: e.target.value }))}
              placeholder={t('history.filter.supplierPlaceholder', { defaultValue: 'Supplier code' })}
            />
          </label>
          <label className="filter-bar__field">
            <span>{t('history.filter.from', { defaultValue: 'From' })}</span>
            <input type="date" className="input" value={filters.fromDate} onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))} />
          </label>
          <label className="filter-bar__field">
            <span>{t('history.filter.to', { defaultValue: 'To' })}</span>
            <input type="date" className="input" value={filters.toDate} onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))} />
          </label>
          <label className="filter-bar__field filter-bar__field--grow">
            <span>{t('history.filter.name', { defaultValue: 'Receipt #' })}</span>
            <SearchInput
              value={filters.name}
              onChange={(v) => setFilters((f) => ({ ...f, name: v }))}
              placeholder={t('history.filter.namePlaceholder', { defaultValue: 'MAT-PRE-…' })}
            />
          </label>
        </div>
      </LayoutSection>

      {loading && <PageLoading />}
      {!loading && error && <ApiErrorCard title={t('history.error', { defaultValue: 'Could not load history' })} message={error} onRetry={reload} />}
      {!loading && !error && (
        <LayoutSection variant="raised">
          {data.rows.length === 0 ? (
            <EmptyState
              icon="📋"
              title={t('history.empty', { defaultValue: 'No decisions match these filters' })}
              desc={t('history.emptyDesc', { defaultValue: 'Try widening the date range or clearing the supplier filter.' })}
            />
          ) : (
            <table className="data-table data-table--clickable data-table--fill">
              <thead>
                <tr>
                  <th>{t('history.col.receipt', { defaultValue: 'Receipt #' })}</th>
                  <th className="fill-col">{t('history.col.supplier', { defaultValue: 'Supplier' })}</th>
                  <th className="num">{t('history.col.total', { defaultValue: 'Total' })}</th>
                  <th>{t('history.col.status', { defaultValue: 'Status' })}</th>
                  <th>{t('history.col.decidedBy', { defaultValue: 'Decided by' })}</th>
                  <th>{t('history.col.decidedAt', { defaultValue: 'Decided at' })}</th>
                  <th>{t('history.col.created', { defaultValue: 'Created' })}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.name} onClick={() => openDetail(row.name)} className="data-table__row data-table__row--clickable">
                    <td className="mono">{row.name}</td>
                    <td className="fill-col">
                      <div>{row.supplier_name || row.supplier}</div>
                      {row.supplier_name && row.supplier && row.supplier_name !== row.supplier && (
                        <div className="mono mono--muted">{row.supplier}</div>
                      )}
                    </td>
                    <td className="num">{fmtCurrency(row.grand_total, { currency: row.currency })}</td>
                    <td><Pill tone={decisionTone(row.decision)}>{row.decision}</Pill></td>
                    <td>{row.decided_by || '—'}</td>
                    <td>{row.decided_at ? fmtDateTime(row.decided_at) : '—'}</td>
                    <td>{row.creation ? fmtDateTime(row.creation) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </LayoutSection>
      )}

      <DetailModal
        open={detailOpen}
        onClose={closeDetail}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        t={t}
      />
    </DashboardLayout>
  );
}
