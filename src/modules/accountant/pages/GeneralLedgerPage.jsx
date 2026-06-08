/**
 * /finance/general-ledger — accountant-facing ledger view.
 *
 * Backed by elmahdi.api.accounts_payable.get_general_ledger which reads
 * directly from ERPNext GL Entry, so the running balance reflects every
 * posted transaction (PR/PI/POS/Payment/Journal).
 *
 * Filters:
 *   - date range (defaults to last 30 days)
 *   - account (leaf accounts only — pulled live from the Account doctype)
 *   - branch (cost_center)
 *
 * Export: CSV/Excel/PDF via the shared exportTable() utility.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ApiErrorCard,
  Btn,
  EmptyState,
  PageHeader,
  PageLoading,
} from '../../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { fetchGeneralLedger } from '../../../services/accountsPayableService';
import { fmtCurrency, fmtDate } from '../../../utils/format';
import { exportTable } from '../../../utils/export';
import { printReportPdf } from '../../../utils/printErpFormat';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import api from '../../../services/api';

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultToDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function GeneralLedgerPage() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const [fromDate, setFromDate] = useState(defaultFromDate());
  const [toDate, setToDate] = useState(defaultToDate());
  const [account, setAccount] = useState('');
  const [branch, setBranch] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Bootstrap account list from ERPNext Account doctype (leaf accounts only).
  useEffect(() => {
    api.get('/api/resource/Account', {
      params: {
        fields: JSON.stringify(['name', 'account_name', 'account_type']),
        filters: JSON.stringify([['is_group', '=', 0], ['disabled', '=', 0]]),
        order_by: 'account_type, name asc',
        limit_page_length: 500,
      },
    })
      .then((res) => setAccounts(res?.data?.data || []))
      .catch(() => setAccounts([]));
  }, []);

  // Preselect Cash / Bank accounts when navigated from the dashboard KPI links.
  useEffect(() => {
    const params = new URLSearchParams(search);
    const accountType = params.get('accountType');
    if (!accountType || !accounts.length) return;
    const match = accounts.find((a) => a.account_type === accountType);
    if (match) setAccount(match.name);
  }, [search, accounts]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchGeneralLedger({
        fromDate,
        toDate,
        account: account || undefined,
        branch: branch || undefined,
        limit: 1000,
      });
      setData(res || null);
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, account, branch]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.rows || [];
  const totals = data?.totals || { debit: 0, credit: 0, closing_balance: 0 };

  const exportColumns = useMemo(() => [
    { key: 'posting_date', label: t('finance.gl.col.date', { defaultValue: 'Date' }) },
    { key: 'voucher_no',   label: t('finance.gl.col.voucher', { defaultValue: 'Voucher' }) },
    { key: 'account',      label: t('finance.gl.col.account', { defaultValue: 'Account' }) },
    { key: 'debit',        label: t('finance.gl.col.debit', { defaultValue: 'Debit' }),
      export: (r) => r.debit },
    { key: 'credit',       label: t('finance.gl.col.credit', { defaultValue: 'Credit' }),
      export: (r) => r.credit },
    { key: 'balance',      label: t('finance.gl.col.balance', { defaultValue: 'Running balance' }),
      export: (r) => r.balance },
    { key: 'branch',       label: t('finance.gl.col.branch', { defaultValue: 'Branch' }) },
  ], [t]);

  const doExport = (format) => {
    // PDF routes through the unified ERPNext print system (logo, branded
    // header, page numbers). CSV/Excel still use the table exporter.
    if (format === 'pdf') {
      printReportPdf('general_ledger', {
        from_date: fromDate,
        to_date: toDate,
        account: account || undefined,
        branch: branch || undefined,
      });
      return;
    }
    exportTable({
      format,
      filename: `general-ledger-${fromDate}-${toDate}`,
      columns: exportColumns,
      rows,
      title: t('finance.gl.title', { defaultValue: 'General Ledger' }),
      elementId: 'gl-table',
    });
  };

  return (
    <TablePageLayout>
      <PageHeader
        title={t('finance.gl.title', { defaultValue: 'General Ledger' })}
        subtitle={t('finance.gl.subtitle', { defaultValue: 'Posted accounting entries from ERPNext.' })}
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
          <select className="input" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account">
            <option value="">{t('finance.gl.allAccounts', { defaultValue: 'All accounts' })}</option>
            {accounts.map((a) => (
              <option key={a.name} value={a.name}>{a.account_name || a.name}</option>
            ))}
          </select>
          <input
            type="search"
            className="input"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder={t('finance.gl.branchPlaceholder', { defaultValue: 'Branch / cost center' })}
          />
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="📒"
          title={t('finance.gl.empty', { defaultValue: 'No ledger entries in this range' })}
          desc={t('finance.gl.emptyDesc', { defaultValue: 'Adjust filters or post transactions in ERPNext.' })}
        />
      ) : (
        <LayoutSection variant="raised" flushHead>
          <TableRegion>
            <div className="table-wrap" id="gl-table">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>{t('finance.gl.col.date', { defaultValue: 'Date' })}</th>
                    <th>{t('finance.gl.col.voucher', { defaultValue: 'Voucher' })}</th>
                    <th>{t('finance.gl.col.account', { defaultValue: 'Account' })}</th>
                    <th className="num">{t('finance.gl.col.debit', { defaultValue: 'Debit' })}</th>
                    <th className="num">{t('finance.gl.col.credit', { defaultValue: 'Credit' })}</th>
                    <th className="num">{t('finance.gl.col.balance', { defaultValue: 'Running balance' })}</th>
                    <th>{t('finance.gl.col.branch', { defaultValue: 'Branch' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name}>
                      <td>{fmtDate(r.posting_date)}</td>
                      <td className="mono" style={{ fontSize: '0.78rem' }}>
                        {r.voucher_type ? `${r.voucher_type} ` : ''}{r.voucher_no}
                      </td>
                      <td>{r.account}</td>
                      <td className="num">{r.debit > 0 ? fmtCurrency(r.debit) : '—'}</td>
                      <td className="num">{r.credit > 0 ? fmtCurrency(r.credit) : '—'}</td>
                      <td className="num"><strong>{fmtCurrency(r.balance)}</strong></td>
                      <td style={{ fontSize: '0.8rem' }}>{r.branch || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="num">
                      <strong>{t('finance.gl.totals', { defaultValue: 'Totals' })}</strong>
                    </td>
                    <td className="num"><strong>{fmtCurrency(totals.debit)}</strong></td>
                    <td className="num"><strong>{fmtCurrency(totals.credit)}</strong></td>
                    <td className="num"><strong>{fmtCurrency(totals.closing_balance)}</strong></td>
                    <td />
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
