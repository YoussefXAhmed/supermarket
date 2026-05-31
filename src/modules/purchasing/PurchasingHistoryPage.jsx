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
} from '../../components/ui';
import { DashboardLayout, LayoutSection } from '../../components/layout/page-layouts';
import { useAuth } from '../../hooks/useAuth';
import { fmtCurrency, fmtDate, fmtDateTime } from '../../utils/format';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import {
  downloadReportCsv,
  downloadReportXlsx,
  downloadReportPdf,
} from '../../components/reports/reportExport';
import {
  listPurchaseReceiptHistory,
  listPurchaseInvoiceHistory,
  getPurchaseReceiptDetail,
  getPurchaseInvoiceDetail,
  getPurchasingDashboardKpis,
} from '../../services/purchasingHistoryApi';

// ── status palette ───────────────────────────────────────────────────────────

const PR_STATUSES = [
  { value: 'all', defaultLabel: 'All' },
  { value: 'draft', defaultLabel: 'Draft' },
  { value: 'pending_approval', defaultLabel: 'Pending approval' },
  { value: 'approved', defaultLabel: 'Approved' },
  { value: 'rejected', defaultLabel: 'Rejected' },
];

const PI_STATUSES = [
  { value: 'all', defaultLabel: 'All' },
  { value: 'outstanding', defaultLabel: 'Outstanding' },
  { value: 'partial', defaultLabel: 'Partially paid' },
  { value: 'paid', defaultLabel: 'Paid' },
];

function prTone(status) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'pending_approval') return 'warning';
  return 'default';
}

function piTone(status) {
  if (status === 'paid') return 'success';
  if (status === 'partial') return 'warning';
  if (status === 'outstanding') return 'danger';
  return 'default';
}

// ── export envelope builders ─────────────────────────────────────────────────

function buildReceiptEnvelope(rows, t) {
  return {
    columns: [
      { key: 'name', label: t('purchHist.col.receipt', { defaultValue: 'Purchase Receipt' }), type: 'text' },
      { key: 'supplier_name', label: t('purchHist.col.supplier', { defaultValue: 'Supplier' }), type: 'text' },
      { key: 'grand_total', label: t('purchHist.col.total', { defaultValue: 'Total' }), type: 'currency' },
      { key: 'status', label: t('purchHist.col.status', { defaultValue: 'Status' }), type: 'text' },
      { key: 'decided_by', label: t('purchHist.col.decidedBy', { defaultValue: 'Decided by' }), type: 'text' },
      { key: 'decided_at', label: t('purchHist.col.decidedAt', { defaultValue: 'Decided at' }), type: 'datetime' },
      { key: 'posting_date', label: t('purchHist.col.posting', { defaultValue: 'Posting' }), type: 'date' },
      { key: 'creation', label: t('purchHist.col.created', { defaultValue: 'Created' }), type: 'datetime' },
    ],
    rows,
  };
}

function buildInvoiceEnvelope(rows, t) {
  return {
    columns: [
      { key: 'name', label: t('purchHist.col.invoice', { defaultValue: 'Purchase Invoice' }), type: 'text' },
      { key: 'supplier_name', label: t('purchHist.col.supplier', { defaultValue: 'Supplier' }), type: 'text' },
      { key: 'grand_total', label: t('purchHist.col.total', { defaultValue: 'Total' }), type: 'currency' },
      { key: 'paid_amount', label: t('purchHist.col.paid', { defaultValue: 'Paid' }), type: 'currency' },
      { key: 'outstanding_amount', label: t('purchHist.col.outstanding', { defaultValue: 'Outstanding' }), type: 'currency' },
      { key: 'status', label: t('purchHist.col.payStatus', { defaultValue: 'Payment status' }), type: 'text' },
      { key: 'posting_date', label: t('purchHist.col.posting', { defaultValue: 'Posting' }), type: 'date' },
      { key: 'due_date', label: t('purchHist.col.due', { defaultValue: 'Due' }), type: 'date' },
    ],
    rows,
  };
}

// ── filter bar (shared) ──────────────────────────────────────────────────────

function FilterBar({ filters, setFilters, statusOptions, namePlaceholder, t }) {
  return (
    <div className="filter-bar">
      <label className="filter-bar__field">
        <span>{t('purchHist.filter.status', { defaultValue: 'Status' })}</span>
        <select
          className="input"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.defaultLabel}</option>
          ))}
        </select>
      </label>
      <label className="filter-bar__field">
        <span>{t('purchHist.filter.supplier', { defaultValue: 'Supplier' })}</span>
        <input
          className="input"
          value={filters.supplier}
          onChange={(e) => setFilters((f) => ({ ...f, supplier: e.target.value }))}
          placeholder={t('purchHist.filter.supplierPlaceholder', { defaultValue: 'Supplier code' })}
        />
      </label>
      <label className="filter-bar__field">
        <span>{t('purchHist.filter.from', { defaultValue: 'From' })}</span>
        <input type="date" className="input" value={filters.fromDate} onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))} />
      </label>
      <label className="filter-bar__field">
        <span>{t('purchHist.filter.to', { defaultValue: 'To' })}</span>
        <input type="date" className="input" value={filters.toDate} onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))} />
      </label>
      <label className="filter-bar__field filter-bar__field--grow">
        <span>{t('purchHist.filter.name', { defaultValue: 'Document #' })}</span>
        <SearchInput
          value={filters.name}
          onChange={(v) => setFilters((f) => ({ ...f, name: v }))}
          placeholder={namePlaceholder}
        />
      </label>
    </div>
  );
}

// ── PR drill-down modal ──────────────────────────────────────────────────────

function ReceiptDetailModal({ open, onClose, detail, loading, error, t }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={detail ? `${detail.name} — ${detail.supplier?.supplier_name || detail.supplier?.name || ''}` : t('purchHist.detail.prTitle', { defaultValue: 'Purchase receipt' })}
      size="lg"
    >
      {loading && <PageLoading />}
      {!loading && error && <ApiErrorCard title={t('purchHist.detail.error', { defaultValue: 'Could not load details' })} message={error} />}
      {!loading && !error && detail && (
        <div className="purchase-history-detail">
          <section className="purchase-history-detail__meta">
            <div>
              <h3>{t('purchHist.detail.receiptInfo', { defaultValue: 'Receipt' })}</h3>
              <dl className="kv">
                <dt>{t('purchHist.col.receipt')}</dt><dd className="mono">{detail.name}</dd>
                <dt>{t('purchHist.col.status')}</dt><dd><Pill tone={prTone(detail.status)}>{detail.status}</Pill></dd>
                <dt>{t('purchHist.col.posting')}</dt><dd>{fmtDate(detail.posting_date)}</dd>
                <dt>{t('purchHist.col.warehouse', { defaultValue: 'Warehouse' })}</dt><dd>{detail.warehouse || '—'}</dd>
                <dt>{t('purchHist.col.total')}</dt><dd>{fmtCurrency(detail.grand_total, { currency: detail.currency })}</dd>
                <dt>{t('purchHist.col.created')}</dt><dd>{fmtDateTime(detail.creation)}</dd>
              </dl>
            </div>
            <div>
              <h3>{t('purchHist.detail.supplierInfo', { defaultValue: 'Supplier' })}</h3>
              <dl className="kv">
                <dt>{t('purchHist.col.supplier')}</dt><dd>{detail.supplier?.supplier_name || '—'}</dd>
                <dt>{t('purchHist.col.supplierCode', { defaultValue: 'Code' })}</dt><dd className="mono">{detail.supplier?.name || '—'}</dd>
                {detail.supplier?.mobile_no && (
                  <>
                    <dt>{t('purchHist.col.phone', { defaultValue: 'Phone' })}</dt>
                    <dd>{detail.supplier.mobile_no}</dd>
                  </>
                )}
              </dl>
            </div>
            <div>
              <h3>{t('purchHist.detail.approval', { defaultValue: 'Approval history' })}</h3>
              <dl className="kv">
                <dt>{t('purchHist.col.requestedBy', { defaultValue: 'Created by' })}</dt><dd>{detail.requested_by || '—'}</dd>
                <dt>{t('purchHist.col.decidedBy')}</dt><dd>{detail.approved_by || '—'}</dd>
                <dt>{t('purchHist.col.decidedAt')}</dt><dd>{detail.approved_at ? fmtDateTime(detail.approved_at) : '—'}</dd>
                {detail.decision_notes && (
                  <>
                    <dt>{t('purchHist.col.notes', { defaultValue: 'Notes' })}</dt>
                    <dd>{detail.decision_notes}</dd>
                  </>
                )}
              </dl>
            </div>
            <div>
              <h3>{t('purchHist.detail.payment', { defaultValue: 'Payment status' })}</h3>
              <dl className="kv">
                <dt>{t('purchHist.col.invoice', { defaultValue: 'Linked invoice' })}</dt>
                <dd className="mono">{detail.payment?.invoice || '—'}</dd>
                {detail.payment?.status && (
                  <>
                    <dt>{t('purchHist.col.payStatus')}</dt>
                    <dd><Pill tone={piTone(detail.payment.status)}>{detail.payment.status}</Pill></dd>
                  </>
                )}
                {detail.payment?.invoice && (
                  <>
                    <dt>{t('purchHist.col.outstanding')}</dt>
                    <dd>{fmtCurrency(detail.payment.outstanding, { currency: detail.currency })}</dd>
                  </>
                )}
              </dl>
            </div>
          </section>

          <section>
            <h3>{t('purchHist.detail.items', { defaultValue: 'Items' })}</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('purchHist.detail.item', { defaultValue: 'Item' })}</th>
                  <th className="num">{t('purchHist.detail.qty', { defaultValue: 'Qty' })}</th>
                  <th>{t('purchHist.detail.uom', { defaultValue: 'UOM' })}</th>
                  <th className="num">{t('purchHist.detail.rate', { defaultValue: 'Rate' })}</th>
                  <th className="num">{t('purchHist.detail.amount', { defaultValue: 'Amount' })}</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((line, idx) => (
                  <tr key={`${line.item_code}-${idx}`}>
                    <td><div className="mono">{line.item_code}</div><div>{line.item_name}</div></td>
                    <td className="num">{line.qty}</td>
                    <td>{line.uom}</td>
                    <td className="num">{fmtCurrency(line.rate, { currency: detail.currency })}</td>
                    <td className="num">{fmtCurrency(line.amount, { currency: detail.currency })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="num"><strong>{t('purchHist.detail.total', { defaultValue: 'Total' })}</strong></td>
                  <td className="num"><strong>{fmtCurrency(detail.grand_total, { currency: detail.currency })}</strong></td>
                </tr>
              </tfoot>
            </table>
          </section>

          {detail.events?.length > 0 && (
            <section>
              <h3>{t('purchHist.detail.audit', { defaultValue: 'Audit trail' })}</h3>
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

// ── PI drill-down modal ──────────────────────────────────────────────────────

function InvoiceDetailModal({ open, onClose, detail, loading, error, t }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={detail ? `${detail.name} — ${detail.supplier?.supplier_name || detail.supplier?.name || ''}` : t('purchHist.detail.piTitle', { defaultValue: 'Purchase invoice' })}
      size="lg"
    >
      {loading && <PageLoading />}
      {!loading && error && <ApiErrorCard title={t('purchHist.detail.error', { defaultValue: 'Could not load details' })} message={error} />}
      {!loading && !error && detail && (
        <div className="purchase-history-detail">
          <section className="purchase-history-detail__meta">
            <div>
              <h3>{t('purchHist.detail.invoiceInfo', { defaultValue: 'Invoice' })}</h3>
              <dl className="kv">
                <dt>{t('purchHist.col.invoice')}</dt><dd className="mono">{detail.name}</dd>
                <dt>{t('purchHist.col.payStatus')}</dt><dd><Pill tone={piTone(detail.status)}>{detail.status}</Pill></dd>
                <dt>{t('purchHist.col.posting')}</dt><dd>{fmtDate(detail.posting_date)}</dd>
                <dt>{t('purchHist.col.due')}</dt><dd>{fmtDate(detail.due_date) || '—'}</dd>
                <dt>{t('purchHist.col.total')}</dt><dd>{fmtCurrency(detail.grand_total, { currency: detail.currency })}</dd>
                <dt>{t('purchHist.col.paid')}</dt><dd>{fmtCurrency(detail.paid_amount, { currency: detail.currency })} ({detail.paid_pct}%)</dd>
                <dt>{t('purchHist.col.outstanding')}</dt><dd>{fmtCurrency(detail.outstanding_amount, { currency: detail.currency })}</dd>
              </dl>
            </div>
            <div>
              <h3>{t('purchHist.detail.supplierInfo', { defaultValue: 'Supplier' })}</h3>
              <dl className="kv">
                <dt>{t('purchHist.col.supplier')}</dt><dd>{detail.supplier?.supplier_name || '—'}</dd>
                <dt>{t('purchHist.col.supplierCode', { defaultValue: 'Code' })}</dt><dd className="mono">{detail.supplier?.name || '—'}</dd>
                {detail.supplier?.mobile_no && (
                  <>
                    <dt>{t('purchHist.col.phone', { defaultValue: 'Phone' })}</dt>
                    <dd>{detail.supplier.mobile_no}</dd>
                  </>
                )}
              </dl>
            </div>
          </section>

          <section>
            <h3>{t('purchHist.detail.items', { defaultValue: 'Items' })}</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('purchHist.detail.item', { defaultValue: 'Item' })}</th>
                  <th className="num">{t('purchHist.detail.qty', { defaultValue: 'Qty' })}</th>
                  <th>{t('purchHist.detail.uom', { defaultValue: 'UOM' })}</th>
                  <th className="num">{t('purchHist.detail.rate', { defaultValue: 'Rate' })}</th>
                  <th className="num">{t('purchHist.detail.amount', { defaultValue: 'Amount' })}</th>
                  <th>{t('purchHist.detail.linkedPr', { defaultValue: 'Source PR' })}</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((line, idx) => (
                  <tr key={`${line.item_code}-${idx}`}>
                    <td><div className="mono">{line.item_code}</div><div>{line.item_name}</div></td>
                    <td className="num">{line.qty}</td>
                    <td>{line.uom}</td>
                    <td className="num">{fmtCurrency(line.rate, { currency: detail.currency })}</td>
                    <td className="num">{fmtCurrency(line.amount, { currency: detail.currency })}</td>
                    <td className="mono">{line.purchase_receipt || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {detail.receipts?.length > 0 && (
            <section>
              <h3>{t('purchHist.detail.linkedReceipts', { defaultValue: 'Linked receipts (approval trail)' })}</h3>
              <ul className="purchase-history-detail__events">
                {detail.receipts.map((r) => (
                  <li key={r.name}>
                    <span className="mono">{r.name}</span>{' '}
                    <Pill tone={prTone(r.status)}>{r.status}</Pill>{' '}
                    {r.approved_by && <span>by {r.approved_by} @ {fmtDateTime(r.approved_at)}</span>}
                    {r.decision_notes && <p>{r.decision_notes}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail.payments?.length > 0 && (
            <section>
              <h3>{t('purchHist.detail.payments', { defaultValue: 'Payments' })}</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('purchHist.col.paymentEntry', { defaultValue: 'Payment Entry' })}</th>
                    <th>{t('purchHist.col.posting')}</th>
                    <th className="num">{t('purchHist.col.allocated', { defaultValue: 'Allocated' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.payments.map((p) => (
                    <tr key={p.name}>
                      <td className="mono">{p.name}</td>
                      <td>{fmtDate(p.posting_date)}</td>
                      <td className="num">{fmtCurrency(p.allocated_amount, { currency: detail.currency })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── tab tables ───────────────────────────────────────────────────────────────

function ReceiptsTable({ rows, onOpen, t }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title={t('purchHist.empty.pr', { defaultValue: 'No purchase receipts match these filters' })}
        desc={t('purchHist.emptyDesc', { defaultValue: 'Try widening the date range or clearing the status filter.' })}
      />
    );
  }
  return (
    <table className="data-table data-table--clickable data-table--fill">
      <thead>
        <tr>
          <th>{t('purchHist.col.receipt', { defaultValue: 'Receipt #' })}</th>
          <th className="fill-col">{t('purchHist.col.supplier', { defaultValue: 'Supplier' })}</th>
          <th className="num">{t('purchHist.col.total', { defaultValue: 'Total' })}</th>
          <th>{t('purchHist.col.status', { defaultValue: 'Status' })}</th>
          <th>{t('purchHist.col.decidedBy', { defaultValue: 'Decided by' })}</th>
          <th>{t('purchHist.col.decidedAt', { defaultValue: 'Decided at' })}</th>
          <th>{t('purchHist.col.created', { defaultValue: 'Created' })}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name} onClick={() => onOpen(row.name)} className="data-table__row data-table__row--clickable">
            <td className="mono">{row.name}</td>
            <td className="fill-col">
              <div>{row.supplier_name || row.supplier}</div>
              {row.supplier_name && row.supplier && row.supplier_name !== row.supplier && (
                <div className="mono mono--muted">{row.supplier}</div>
              )}
            </td>
            <td className="num">{fmtCurrency(row.grand_total, { currency: row.currency })}</td>
            <td><Pill tone={prTone(row.status)}>{row.status}</Pill></td>
            <td>{row.decided_by || '—'}</td>
            <td>{row.decided_at ? fmtDateTime(row.decided_at) : '—'}</td>
            <td>{row.creation ? fmtDateTime(row.creation) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InvoicesTable({ rows, onOpen, t }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="🧾"
        title={t('purchHist.empty.pi', { defaultValue: 'No purchase invoices match these filters' })}
        desc={t('purchHist.emptyDesc', { defaultValue: 'Try widening the date range or clearing the status filter.' })}
      />
    );
  }
  return (
    <table className="data-table data-table--clickable data-table--fill">
      <thead>
        <tr>
          <th>{t('purchHist.col.invoice', { defaultValue: 'Bill #' })}</th>
          <th className="fill-col">{t('purchHist.col.supplier', { defaultValue: 'Supplier' })}</th>
          <th className="num">{t('purchHist.col.total', { defaultValue: 'Total' })}</th>
          <th className="num">{t('purchHist.col.paid', { defaultValue: 'Paid' })}</th>
          <th className="num">{t('purchHist.col.outstanding', { defaultValue: 'Outstanding' })}</th>
          <th>{t('purchHist.col.payStatus', { defaultValue: 'Payment' })}</th>
          <th>{t('purchHist.col.posting', { defaultValue: 'Posting' })}</th>
          <th>{t('purchHist.col.due', { defaultValue: 'Due' })}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name} onClick={() => onOpen(row.name)} className="data-table__row data-table__row--clickable">
            <td className="mono">{row.name}</td>
            <td className="fill-col">
              <div>{row.supplier_name || row.supplier}</div>
              {row.supplier_name && row.supplier && row.supplier_name !== row.supplier && (
                <div className="mono mono--muted">{row.supplier}</div>
              )}
            </td>
            <td className="num">{fmtCurrency(row.grand_total, { currency: row.currency })}</td>
            <td className="num">{fmtCurrency(row.paid_amount, { currency: row.currency })}</td>
            <td className="num">{fmtCurrency(row.outstanding_amount, { currency: row.currency })}</td>
            <td><Pill tone={piTone(row.status)}>{row.status}</Pill></td>
            <td>{fmtDate(row.posting_date)}</td>
            <td>{fmtDate(row.due_date) || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── main page ────────────────────────────────────────────────────────────────

export default function PurchasingHistoryPage() {
  const { t } = useTranslation();
  const { capabilities } = useAuth();
  const canView = Boolean(capabilities?.canViewPurchasingHistory || capabilities?.canManageSystem);

  const [tab, setTab] = useState('receipts'); // 'receipts' | 'invoices'
  const [kpis, setKpis] = useState(null);
  const [prRows, setPrRows] = useState([]);
  const [piRows, setPiRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [prFilters, setPrFilters] = useState({ status: 'all', supplier: '', fromDate: '', toDate: '', name: '' });
  const [piFilters, setPiFilters] = useState({ status: 'all', supplier: '', fromDate: '', toDate: '', name: '' });

  const [detailKind, setDetailKind] = useState(''); // 'pr' | 'pi'
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const reloadList = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      if (tab === 'receipts') {
        const res = await listPurchaseReceiptHistory(prFilters);
        setPrRows(res.rows || []);
      } else {
        const res = await listPurchaseInvoiceHistory(piFilters);
        setPiRows(res.rows || []);
      }
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [canView, tab, prFilters, piFilters]);

  const reloadKpis = useCallback(async () => {
    if (!canView) return;
    try {
      const k = await getPurchasingDashboardKpis();
      setKpis(k);
    } catch (e) {
      // KPIs are best-effort; surface errors via the list error instead.
      setError((prev) => prev || getUserFriendlyMessage(e));
    }
  }, [canView]);

  useEffect(() => { reloadKpis(); }, [reloadKpis]);
  useEffect(() => { reloadList(); }, [reloadList]);

  const openDetail = useCallback(async (kind, name) => {
    setDetailKind(kind);
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    setDetailError('');
    try {
      const d = kind === 'pr'
        ? await getPurchaseReceiptDetail(name)
        : await getPurchaseInvoiceDetail(name);
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

  const exportContext = useMemo(() => {
    const isPR = tab === 'receipts';
    const filters = isPR ? prFilters : piFilters;
    return {
      title: isPR
        ? t('purchHist.titlePR', { defaultValue: 'Purchase Receipt History' })
        : t('purchHist.titlePI', { defaultValue: 'Purchase Invoice History' }),
      subtitle: t('purchHist.subtitle', { defaultValue: 'Operational purchasing records' }),
      filters: {
        Status: filters.status,
        Supplier: filters.supplier,
        From: filters.fromDate,
        To: filters.toDate,
      },
    };
  }, [tab, prFilters, piFilters, t]);

  const envelope = useMemo(
    () => (tab === 'receipts' ? buildReceiptEnvelope(prRows, t) : buildInvoiceEnvelope(piRows, t)),
    [tab, prRows, piRows, t],
  );

  const onCsv = useCallback(() => downloadReportCsv(envelope, exportContext), [envelope, exportContext]);
  const onXlsx = useCallback(() => downloadReportXlsx(envelope, exportContext), [envelope, exportContext]);
  const onPdf = useCallback(() => downloadReportPdf(envelope, exportContext), [envelope, exportContext]);
  const onPrint = useCallback(() => window.print(), []);

  if (!canView) {
    return (
      <DashboardLayout>
        <PageHeader title={t('purchHist.title', { defaultValue: 'Purchasing History' })} subtitle={t('common.accessDenied')} dense />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('purchHist.title', { defaultValue: 'Purchasing History' })}
        subtitle={t('purchHist.subtitle', { defaultValue: 'Operational purchasing records' })}
        dense
        actions={(
          <div className="page-header__actions">
            <Btn variant="ghost" size="sm" onClick={() => { reloadKpis(); reloadList(); }}>{t('common.refresh', { defaultValue: 'Refresh' })}</Btn>
            <Btn variant="ghost" size="sm" onClick={onPrint}>{t('purchHist.print', { defaultValue: 'Print' })}</Btn>
            <Btn variant="ghost" size="sm" onClick={onCsv}>{t('purchHist.csv', { defaultValue: 'CSV' })}</Btn>
            <Btn variant="ghost" size="sm" onClick={onXlsx}>{t('purchHist.xlsx', { defaultValue: 'Excel' })}</Btn>
            <Btn variant="primary" size="sm" onClick={onPdf}>{t('purchHist.pdf', { defaultValue: 'PDF' })}</Btn>
          </div>
        )}
      />

      <section className="layout-grid layout-grid--kpi" aria-label={t('purchHist.kpis', { defaultValue: 'Purchasing KPIs' })}>
        <StatCard label={t('purchHist.kpi.pending', { defaultValue: 'Pending purchases' })} value={kpis?.pr_pending?.count ?? 0} icon="⌛" color="amber" compact />
        <StatCard label={t('purchHist.kpi.approved', { defaultValue: 'Approved purchases' })} value={kpis?.pr_approved?.count ?? 0} icon="✓" color="emerald" compact />
        <StatCard label={t('purchHist.kpi.rejected', { defaultValue: 'Rejected purchases' })} value={kpis?.pr_rejected?.count ?? 0} icon="✕" color="red" compact />
        <StatCard label={t('purchHist.kpi.outstanding', { defaultValue: 'Outstanding invoices' })} value={kpis?.pi_outstanding?.count ?? 0} icon="₤" color="red" compact />
        <StatCard label={t('purchHist.kpi.paid', { defaultValue: 'Paid invoices' })} value={kpis?.pi_paid?.count ?? 0} icon="✓" color="emerald" compact />
      </section>

      <LayoutSection variant="flat">
        <div className="tab-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'receipts'}
            className={`tab-bar__tab ${tab === 'receipts' ? 'tab-bar__tab--active' : ''}`}
            onClick={() => setTab('receipts')}
          >
            {t('purchHist.tabs.receipts', { defaultValue: 'Purchase Receipts' })}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'invoices'}
            className={`tab-bar__tab ${tab === 'invoices' ? 'tab-bar__tab--active' : ''}`}
            onClick={() => setTab('invoices')}
          >
            {t('purchHist.tabs.invoices', { defaultValue: 'Purchase Invoices' })}
          </button>
        </div>
      </LayoutSection>

      <LayoutSection variant="flat">
        {tab === 'receipts' ? (
          <FilterBar
            filters={prFilters}
            setFilters={setPrFilters}
            statusOptions={PR_STATUSES}
            namePlaceholder={t('purchHist.filter.prPlaceholder', { defaultValue: 'MAT-PRE-…' })}
            t={t}
          />
        ) : (
          <FilterBar
            filters={piFilters}
            setFilters={setPiFilters}
            statusOptions={PI_STATUSES}
            namePlaceholder={t('purchHist.filter.piPlaceholder', { defaultValue: 'ACC-PINV-…' })}
            t={t}
          />
        )}
      </LayoutSection>

      {loading && <PageLoading />}
      {!loading && error && <ApiErrorCard title={t('purchHist.error', { defaultValue: 'Could not load history' })} message={error} onRetry={reloadList} />}
      {!loading && !error && (
        <LayoutSection variant="raised">
          {tab === 'receipts'
            ? <ReceiptsTable rows={prRows} onOpen={(name) => openDetail('pr', name)} t={t} />
            : <InvoicesTable rows={piRows} onOpen={(name) => openDetail('pi', name)} t={t} />}
        </LayoutSection>
      )}

      {detailKind === 'pr' && (
        <ReceiptDetailModal open={detailOpen} onClose={closeDetail} detail={detail} loading={detailLoading} error={detailError} t={t} />
      )}
      {detailKind === 'pi' && (
        <InvoiceDetailModal open={detailOpen} onClose={closeDetail} detail={detail} loading={detailLoading} error={detailError} t={t} />
      )}
    </DashboardLayout>
  );
}
