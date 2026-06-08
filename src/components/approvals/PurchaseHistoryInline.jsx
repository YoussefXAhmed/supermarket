/**
 * PurchaseHistoryInline — compact, read-only recent approval history.
 *
 * Designed for embedding at the BOTTOM of the Approvals Dashboard so
 * managers / accountants get instant context on what's already been
 * decided without leaving the page. The full History page (with filters,
 * exports, detail modal) is one click away via the footer link.
 *
 * Design rules (kept in sync with the rest of the system):
 *   • Sits inside a LayoutSection variant="raised" — same surface as the
 *     "Pending purchase approvals" section above it.
 *   • Uses StatusPill with the same approve/reject tones used everywhere.
 *   • All numbers via fmtCurrency. All dates via fmtDateTime.
 *   • Shows the last N rows (default 10) — fetched once on mount.
 *   • Click a row → open the SAME modal the full page uses, so the
 *     drilldown behaviour is identical.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  EmptyState,
  PageLoading,
  ApiErrorCard,
  Modal,
} from '../ui';
import { LayoutSection, TableRegion } from '../layout/page-layouts';
import {
  listPurchaseApprovalHistory,
  getPurchaseApprovalDetail,
} from '../../services/purchasingApprovalApi';
import { fmtCurrency, fmtDate, fmtDateTime } from '../../utils/format';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

const DEFAULT_LIMIT = 10;

function decisionTone(decision) {
  if (decision === 'approved') return 'green';
  if (decision === 'rejected') return 'red';
  return 'default';
}

export default function PurchaseHistoryInline({ historyHref, limit = DEFAULT_LIMIT }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listPurchaseApprovalHistory({ status: 'all' })
      .then((res) => {
        if (cancelled) return;
        const all = res?.rows || [];
        setRows(all.slice(0, limit));
      })
      .catch((e) => { if (!cancelled) setError(getUserFriendlyMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [limit]);

  const openDetail = useCallback(async (name) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await getPurchaseApprovalDetail(name);
      setDetail(d);
    } catch (e) {
      setDetail({ _error: getUserFriendlyMessage(e) });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = () => { setDetailOpen(false); setDetail(null); };

  return (
    <>
      <LayoutSection
        title={t('approvals.recentHistory', { defaultValue: 'Recent approval history' })}
        subtitle={t('approvals.recentHistorySub', {
          defaultValue: 'Last {{n}} decisions across this workspace',
          n: limit,
        })}
        variant="raised"
        flushHead
      >
        {loading ? (
          <PageLoading size={22} />
        ) : error ? (
          <ApiErrorCard message={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="📜"
            title={t('approvals.noHistory', { defaultValue: 'No approval history yet' })}
            desc={t('approvals.noHistoryDesc', {
              defaultValue: 'Decisions on goods receipts will appear here.',
            })}
          />
        ) : (
          <TableRegion>
            <div className="table-wrap">
              <table className="table table--compact approval-history-inline">
                <thead>
                  <tr>
                    <th>{t('history.col.receipt', { defaultValue: 'Goods Receipt' })}</th>
                    <th>{t('history.col.supplier', { defaultValue: 'Supplier' })}</th>
                    <th className="num">{t('history.col.total', { defaultValue: 'Total' })}</th>
                    <th>{t('history.col.status', { defaultValue: 'Decision' })}</th>
                    <th>{t('history.col.decidedBy', { defaultValue: 'Decided by' })}</th>
                    <th>{t('history.col.decidedAt', { defaultValue: 'Decided at' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.name}
                      className="approval-history-inline__row"
                      onClick={() => openDetail(r.name)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') openDetail(r.name); }}
                    >
                      <td className="mono">{r.name}</td>
                      <td>{r.supplier_name || r.supplier || '—'}</td>
                      <td className="num">{fmtCurrency(r.grand_total, { currency: r.currency })}</td>
                      <td>
                        <Badge color={decisionTone(r.decision)}>
                          {r.decision === 'approved'
                            ? t('history.approved', { defaultValue: 'Approved' })
                            : r.decision === 'rejected'
                              ? t('history.rejected', { defaultValue: 'Rejected' })
                              : r.decision || '—'}
                        </Badge>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{r.decided_by || '—'}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                        {r.decided_at ? fmtDateTime(r.decided_at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableRegion>
        )}
        {historyHref && rows.length > 0 && (
          <p className="approval-section-link">
            <Link to={historyHref}>
              {t('approvals.viewFullHistory', { defaultValue: 'View full approval history →' })}
            </Link>
          </p>
        )}
      </LayoutSection>

      {/* Compact detail modal — opens on row click. */}
      <Modal
        open={detailOpen}
        onClose={closeDetail}
        size="md"
        title={detail?.name
          ? `${detail.name}${detail.supplier?.supplier_name ? ' — ' + detail.supplier.supplier_name : ''}`
          : t('history.detail.title', { defaultValue: 'Approval details' })}
      >
        {detailLoading && <PageLoading size={22} />}
        {!detailLoading && detail?._error && <ApiErrorCard message={detail._error} />}
        {!detailLoading && detail && !detail._error && (
          <div className="purchase-history-detail__compact">
            <dl className="kv">
              <dt>{t('history.col.receipt', { defaultValue: 'Goods Receipt' })}</dt>
              <dd className="mono">{detail.name}</dd>
              <dt>{t('history.col.supplier', { defaultValue: 'Supplier' })}</dt>
              <dd>{detail.supplier?.supplier_name || '—'}</dd>
              <dt>{t('history.col.posting', { defaultValue: 'Posting date' })}</dt>
              <dd>{fmtDate(detail.posting_date)}</dd>
              <dt>{t('history.col.total', { defaultValue: 'Total' })}</dt>
              <dd>{fmtCurrency(detail.grand_total, { currency: detail.currency })}</dd>
              <dt>{t('history.col.status', { defaultValue: 'Decision' })}</dt>
              <dd>
                <Badge color={decisionTone(detail.decision)}>{detail.decision || '—'}</Badge>
              </dd>
              <dt>{t('history.col.decidedBy', { defaultValue: 'Decided by' })}</dt>
              <dd>{detail.decided_by || '—'}</dd>
              <dt>{t('history.col.decidedAt', { defaultValue: 'Decided at' })}</dt>
              <dd>{detail.decided_at ? fmtDateTime(detail.decided_at) : '—'}</dd>
              {detail.decision_notes && (
                <>
                  <dt>{t('history.col.notes', { defaultValue: 'Notes' })}</dt>
                  <dd style={{ whiteSpace: 'pre-wrap' }}>{detail.decision_notes}</dd>
                </>
              )}
            </dl>
            {historyHref && (
              <p className="approval-section-link" style={{ marginTop: 12 }}>
                <Link to={`${historyHref}?name=${encodeURIComponent(detail.name)}`}>
                  {t('history.openFullDetail', { defaultValue: 'Open full detail page →' })}
                </Link>
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
