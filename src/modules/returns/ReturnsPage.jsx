import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader, Btn, ApiErrorCard, PageLoading } from '../../components/ui';
import { FormPageLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import { useAuth } from '../../hooks/useAuth';
import {
  approveAndSubmitReturn,
  createReturnDraft,
  formatErpMoney,
  listPendingReturns,
  loadReturnContext,
  searchReturnableInvoices,
  summarizeReturnableLines,
} from '../../services/returnsService';
import { getRefundMethods } from '../../utils/returnsValidation';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

export default function ReturnsPage() {
  const { t } = useTranslation();
  const { user, canCreateReturns, canApproveReturns, canViewReturns } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [sourceName, setSourceName] = useState(searchParams.get('invoice') || '');
  const [loadingSource, setLoadingSource] = useState(false);
  const [source, setSource] = useState(null);
  const [returnableLines, setReturnableLines] = useState([]);
  const [lines, setLines] = useState([]);
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('Cash');
  const [lookupResults, setLookupResults] = useState([]);
  const [pending, setPending] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [submittingId, setSubmittingId] = useState('');

  const refundMethods = useMemo(() => getRefundMethods(), []);
  const operator = user?.email || user?.name || 'unknown';

  const formEnabled = Boolean(source && canCreateReturns && !loadingSource);

  const loadSource = useCallback(async (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      setSource(null);
      setReturnableLines([]);
      setErr(t('returns.enterInvoiceNumber'));
      return;
    }
    setLoadingSource(true);
    setErr('');
    setMsg('');
    try {
      const ctx = await loadReturnContext(trimmed);
      if (ctx.errors?.length) {
        setSource(null);
        setReturnableLines([]);
        setErr(ctx.errors.join(' '));
        return;
      }
      setSource(ctx.source);
      const summary = summarizeReturnableLines(ctx.source, ctx.returnedQtyMap);
      setReturnableLines(summary);
      setLines(
        summary
          .filter((r) => r.returnable_qty > 0)
          .slice(0, 8)
          .map((r) => ({ item_code: r.item_code, return_qty: '' })),
      );
      setSearchParams(trimmed ? { invoice: trimmed } : {}, { replace: true });
    } catch (e) {
      setSource(null);
      setReturnableLines([]);
      setErr(getUserFriendlyMessage(e));
    } finally {
      setLoadingSource(false);
    }
  }, [setSearchParams, t]);

  const refreshPending = useCallback(async () => {
    if (!canApproveReturns) return;
    try {
      const rows = await listPendingReturns();
      setPending(rows);
    } catch {
      setPending([]);
    }
  }, [canApproveReturns]);

  useEffect(() => {
    if (!canViewReturns) return;
    refreshPending();
  }, [canViewReturns, refreshPending]);

  useEffect(() => {
    const inv = searchParams.get('invoice');
    if (inv && inv !== sourceName) setSourceName(inv);
    if (inv) loadSource(inv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onLookup = async () => {
    setErr('');
    try {
      const rows = await searchReturnableInvoices(sourceName);
      setLookupResults(rows);
    } catch (e) {
      setLookupResults([]);
      setErr(getUserFriendlyMessage(e));
    }
  };

  const onCreateDraft = async (e) => {
    e.preventDefault();
    if (!formEnabled || saving) return;
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const result = await createReturnDraft({
        sourceName: source.name,
        lines,
        reason,
        refundMethod,
        operator,
        canCreate: canCreateReturns,
      });
      setMsg(
        `${t('returns.returnDoc')} ${result.returnDoc.name} created. ERP refund total: ${formatErpMoney(result.erpGrandTotal, source.currency)}. ${t('returns.pendingApproval')}.`,
      );
      await loadSource(source.name);
      await refreshPending();
    } catch (e2) {
      setErr(getUserFriendlyMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  const onApprove = async (returnName) => {
    if (!canApproveReturns || submittingId) return;
    setSubmittingId(returnName);
    setErr('');
    setMsg('');
    try {
      const result = await approveAndSubmitReturn({
        returnName,
        approver: operator,
        canApprove: canApproveReturns,
      });
      setMsg(
        `${t('returns.returnDoc')} ${result.returnDoc.name} submitted. Stock reversed by ERP. Refund total: ${formatErpMoney(result.erpGrandTotal, result.source?.currency)}.`,
      );
      await refreshPending();
      if (source?.name) await loadSource(source.name);
    } catch (e) {
      setErr(getUserFriendlyMessage(e));
    } finally {
      setSubmittingId('');
    }
  };

  if (!canViewReturns) {
    return (
      <FormPageLayout>
        <PageHeader title={t('returns.accessDenied')} subtitle={t('returns.accessDeniedSubtitle')} dense />
        <ApiErrorCard message={t('returns.noPermission')} />
      </FormPageLayout>
    );
  }

  return (
    <FormPageLayout>
      <PageHeader
        title={t('returns.title')}
        subtitle={t('returns.subtitle')}
        dense
      />

      {err && <ApiErrorCard message={err} onRetry={() => sourceName && loadSource(sourceName)} />}
      {msg && <p className="inv-success">{msg}</p>}

      <LayoutSection title={t('returns.sourceInvoice')} subtitle={t('returns.sourceInvoiceSubtitle')}>
        <LookupRow
          sourceName={sourceName}
          setSourceName={setSourceName}
          loadingSource={loadingSource}
          onLoad={() => loadSource(sourceName)}
          onLookup={onLookup}
          t={t}
        />
        {lookupResults.length > 0 && (
          <TableRegion fit className="returns-lookup">
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>{t('returns.invoice')}</th>
                  <th>{t('returns.customer')}</th>
                  <th>{t('returns.date')}</th>
                  <th>{t('returns.total')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lookupResults.map((row) => (
                  <tr key={row.name}>
                    <td className="mono">{row.name}</td>
                    <td>{row.customer}</td>
                    <td>{row.posting_date}</td>
                    <td>{formatErpMoney(row.grand_total)}</td>
                    <td>
                      <Btn type="button" size="sm" variant="ghost" onClick={() => loadSource(row.name)}>
                        {t('returns.select')}
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
        )}
        {source && (
          <p className="page-header__sub">
            {t('returns.loaded')}: <strong className="mono">{source.name}</strong> · {source.customer} · {t('returns.item')}{' '}
            <strong>{source.set_warehouse}</strong> · {formatErpMoney(source.grand_total, source.currency)}
          </p>
        )}
      </LayoutSection>

      {loadingSource && <PageLoading size={24} />}

      {source && !loadingSource && (
        <LayoutSection title={t('returns.returnLines')} subtitle={t('returns.returnLinesSubtitle')}>
          <TableRegion>
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>{t('returns.item')}</th>
                  <th>{t('returns.soldQty')}</th>
                  <th>{t('returns.alreadyReturned')}</th>
                  <th>{t('returns.returnable')}</th>
                  <th>{t('returns.returnQty')}</th>
                </tr>
              </thead>
              <tbody>
                {returnableLines.map((row) => (
                  <tr key={row.item_code}>
                    <td>
                      <span className="mono">{row.item_code}</span>
                      <br />
                      <small>{row.item_name}</small>
                    </td>
                    <td>{row.sold_qty}</td>
                    <td>{row.returned_qty}</td>
                    <td>{row.returnable_qty}</td>
                    <td>
                      {row.returnable_qty > 0 ? (
                        <input
                          className="input"
                          type="number"
                          min="0"
                          max={row.returnable_qty}
                          step="1"
                          disabled={!formEnabled}
                          value={
                            lines.find((l) => l.item_code === row.item_code)?.return_qty ?? ''
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            setLines((prev) => {
                              const idx = prev.findIndex((l) => l.item_code === row.item_code);
                              if (idx >= 0) {
                                return prev.map((l, i) =>
                                  i === idx ? { ...l, return_qty: val } : l,
                                );
                              }
                              return [...prev, { item_code: row.item_code, return_qty: val }];
                            });
                          }}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>

          <form className="inv-form form-region form-region--spaced" onSubmit={onCreateDraft}>
            <label>
              {t('returns.reason')}
              <textarea
                className="input"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!formEnabled}
                required
              />
            </label>
            <label>
              {t('returns.refundMethod')}
              <select
                className="input"
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value)}
                disabled={!formEnabled}
                required
              >
                {refundMethods.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <p className="page-header__sub">
              {t('returns.refundAmountNote')}
            </p>
            {canCreateReturns ? (
              <Btn type="submit" variant="primary" loading={saving} disabled={!formEnabled}>
                {t('returns.createDraft')}
              </Btn>
            ) : (
              <p className="page-header__sub">{t('returns.cannotCreate')}</p>
            )}
            {!canApproveReturns && (
              <p className="page-header__sub">{t('returns.managerApprovalNeeded')}</p>
            )}
          </form>
        </LayoutSection>
      )}

      {canApproveReturns && pending.length > 0 && (
        <LayoutSection title={t('returns.pendingApproval')} subtitle={t('returns.pendingApprovalSubtitle')}>
          <TableRegion>
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>{t('returns.returnDoc')}</th>
                  <th>{t('returns.against')}</th>
                  <th>{t('returns.operator')}</th>
                  <th>{t('returns.erpTotal')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.name}>
                    <td className="mono">{row.name}</td>
                    <td className="mono">{row.return_against}</td>
                    <td>{row.audit?.operator || row.owner}</td>
                    <td>{formatErpMoney(row.grand_total, row.currency)}</td>
                    <td>
                      <Btn
                        type="button"
                        size="sm"
                        variant="primary"
                        loading={submittingId === row.name}
                        disabled={Boolean(submittingId)}
                        onClick={() => onApprove(row.name)}
                      >
                        {t('approvals.approveAndSubmit')}
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
        </LayoutSection>
      )}
    </FormPageLayout>
  );
}

function LookupRow({ sourceName, setSourceName, loadingSource, onLoad, onLookup, t }) {
  return (
    <div className="toolbar returns-lookup-row">
      <div className="toolbar__group returns-lookup-row__inputs">
        <input
          className="input toolbar__input-md"
          placeholder={t('returns.invoicePlaceholder')}
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value)}
        />
        <Btn type="button" variant="ghost" onClick={onLookup} disabled={loadingSource}>
          {t('returns.search')}
        </Btn>
        <Btn type="button" variant="primary" onClick={onLoad} loading={loadingSource}>
          {t('returns.loadInvoice')}
        </Btn>
      </div>
    </div>
  );
}
