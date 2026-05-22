import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader, Btn, ApiErrorCard, PageLoading } from '../../components/ui';
import { FormPageLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import { useAuth } from '../../hooks/useAuth';
import {
  approveAndSubmitReturn,
  createReturnDraft,
  formatErpMoney,
  listMyReturnableInvoices,
  listPendingReturns,
  loadReturnContext,
  searchReturnableInvoices,
  summarizeReturnableLines,
} from '../../services/returnsService';
import { getRefundMethods } from '../../utils/returnsValidation';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

export default function ReturnsPage({ cashierMode = false }) {
  const navigate = useNavigate();
  const { user, canCreateReturns, canApproveReturns, canViewReturns } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const canUsePage = cashierMode ? canCreateReturns : canViewReturns;
  const ownerScope = cashierMode ? (user?.name || user?.email || '') : '';

  const [sourceName, setSourceName] = useState(searchParams.get('invoice') || '');
  const [loadingSource, setLoadingSource] = useState(false);
  const [source, setSource] = useState(null);
  const [returnableLines, setReturnableLines] = useState([]);
  const [lines, setLines] = useState([]);
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('Cash');
  const [lookupResults, setLookupResults] = useState([]);
  const [myInvoices, setMyInvoices] = useState([]);
  const [myInvoicesLoading, setMyInvoicesLoading] = useState(false);
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
      setErr('Enter a POS invoice number.');
      return;
    }
    setLoadingSource(true);
    setErr('');
    setMsg('');
    try {
      const ctx = await loadReturnContext(trimmed, {
        scopeToOwner: Boolean(cashierMode && ownerScope),
        operator: ownerScope,
      });
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
  }, [cashierMode, ownerScope, setSearchParams]);

  const refreshMyInvoices = useCallback(async () => {
    if (!cashierMode || !ownerScope) return;
    setMyInvoicesLoading(true);
    try {
      const rows = await listMyReturnableInvoices(ownerScope, { limit: 30 });
      setMyInvoices(rows);
    } catch {
      setMyInvoices([]);
    } finally {
      setMyInvoicesLoading(false);
    }
  }, [cashierMode, ownerScope]);

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
    if (!canViewReturns || cashierMode) return;
    refreshPending();
  }, [canViewReturns, cashierMode, refreshPending]);

  useEffect(() => {
    if (!cashierMode) return;
    refreshMyInvoices();
  }, [cashierMode, refreshMyInvoices]);

  useEffect(() => {
    const inv = searchParams.get('invoice');
    if (inv && inv !== sourceName) setSourceName(inv);
    if (inv) loadSource(inv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onLookup = async () => {
    setErr('');
    try {
      const rows = await searchReturnableInvoices(sourceName, {
        owner: cashierMode ? ownerScope : undefined,
      });
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
        scopeToOwner: Boolean(cashierMode && ownerScope),
      });
      setMsg(
        `Draft return ${result.returnDoc.name} created. ERP refund total: ${formatErpMoney(result.erpGrandTotal, source.currency)}. Awaiting approval.`,
      );
      await loadSource(source.name);
      if (cashierMode) await refreshMyInvoices();
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
        `Return ${result.returnDoc.name} submitted. Stock reversed by ERP. Refund total: ${formatErpMoney(result.erpGrandTotal, result.source?.currency)}.`,
      );
      await refreshPending();
      if (source?.name) await loadSource(source.name);
    } catch (e) {
      setErr(getUserFriendlyMessage(e));
    } finally {
      setSubmittingId('');
    }
  };

  if (!canUsePage) {
    return (
      <FormPageLayout>
        <PageHeader title="Returns" subtitle="Access denied" dense />
        <ApiErrorCard message="You do not have permission to view returns." />
      </FormPageLayout>
    );
  }

  return (
    <FormPageLayout>
      <PageHeader
        title={cashierMode ? 'Customer return' : 'Customer returns'}
        subtitle={
          cashierMode
            ? 'Return against your submitted POS invoices — manager approval required'
            : 'Sales return against submitted POS invoices — ERP reverses stock on submit'
        }
        dense
        actions={
          cashierMode ? (
            <Btn type="button" variant="ghost" size="sm" onClick={() => navigate('/pos')}>
              Back to POS
            </Btn>
          ) : null
        }
      />

      {err && <ApiErrorCard message={err} onRetry={() => sourceName && loadSource(sourceName)} />}
      {msg && <p className="inv-success">{msg}</p>}

      <LayoutSection
        title={cashierMode ? 'Your invoices' : 'Source invoice'}
        subtitle={
          cashierMode
            ? 'Select one of your submitted sales invoices'
            : 'Submitted POS invoice required'
        }
      >
        {cashierMode ? (
          <>
            {myInvoicesLoading ? (
              <PageLoading size={24} />
            ) : myInvoices.length === 0 ? (
              <p className="page-header__sub">No submitted invoices found for your account.</p>
            ) : (
              <TableRegion fit className="returns-lookup">
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {myInvoices.map((row) => (
                      <tr key={row.name}>
                        <td className="mono">{row.name}</td>
                        <td>{row.customer}</td>
                        <td>{row.posting_date}</td>
                        <td>{formatErpMoney(row.grand_total)}</td>
                        <td>
                          <Btn type="button" size="sm" variant="ghost" onClick={() => loadSource(row.name)}>
                            Select
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableRegion>
            )}
            <LookupRow
              sourceName={sourceName}
              setSourceName={setSourceName}
              loadingSource={loadingSource}
              onLoad={() => loadSource(sourceName)}
              onLookup={onLookup}
              loadLabel="Load my invoice"
              placeholder="Your POS invoice number"
            />
          </>
        ) : (
          <>
            <LookupRow
              sourceName={sourceName}
              setSourceName={setSourceName}
              loadingSource={loadingSource}
              onLoad={() => loadSource(sourceName)}
              onLookup={onLookup}
            />
            {lookupResults.length > 0 && (
              <TableRegion fit className="returns-lookup">
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th>Total</th>
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
                            Select
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableRegion>
            )}
          </>
        )}
        {source && (
          <p className="page-header__sub">
            Loaded: <strong className="mono">{source.name}</strong> · {source.customer} · Warehouse{' '}
            <strong>{source.set_warehouse}</strong> · Sold {formatErpMoney(source.grand_total, source.currency)}
          </p>
        )}
      </LayoutSection>

      {loadingSource && <PageLoading size={24} />}

      {source && !loadingSource && (
        <LayoutSection title="Return lines" subtitle="Quantities cannot exceed remaining returnable qty">
          <TableRegion>
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Sold</th>
                  <th>Already returned</th>
                  <th>Returnable</th>
                  <th>Return qty</th>
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
              Return reason
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
              Refund method
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
              Refund amount is set from ERP after the return document is created — not calculated in the browser.
            </p>
            {canCreateReturns ? (
              <Btn type="submit" variant="primary" loading={saving} disabled={!formEnabled}>
                Create return draft
              </Btn>
            ) : (
              <p className="page-header__sub">You cannot create returns with this account.</p>
            )}
            {!canApproveReturns && (
              <p className="page-header__sub">A store manager must approve and submit the draft in ERP.</p>
            )}
          </form>
        </LayoutSection>
      )}

      {canApproveReturns && pending.length > 0 && (
        <LayoutSection title="Pending approval" subtitle="Draft returns — submit to reverse stock">
          <TableRegion>
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>Return</th>
                  <th>Against</th>
                  <th>Operator</th>
                  <th>ERP total</th>
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
                        Approve & submit
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

function LookupRow({
  sourceName,
  setSourceName,
  loadingSource,
  onLoad,
  onLookup,
  loadLabel = 'Load invoice',
  placeholder = 'POS-INV-2026-00042',
}) {
  return (
    <div className="toolbar returns-lookup-row">
      <div className="toolbar__group returns-lookup-row__inputs">
        <input
          className="input toolbar__input-md"
          placeholder={placeholder}
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value)}
        />
        <Btn type="button" variant="ghost" onClick={onLookup} disabled={loadingSource}>
          Search
        </Btn>
        <Btn type="button" variant="primary" onClick={onLoad} loading={loadingSource}>
          {loadLabel}
        </Btn>
      </div>
    </div>
  );
}
