/**
 * /hr/my-payslip — self-service payslip view.
 *
 * Available to EVERY user who has a linked Employee record. They see
 * only their own payslips (row-level scoping via `salary_slip_pqc` from
 * Batch A; the dedicated `list_my_payslips` endpoint adds a second
 * defensive filter).
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiErrorCard, Badge, Btn, EmptyState, Modal,
  PageHeader, PageLoading, Table,
} from '../../components/ui';
import { TablePageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { useNotify } from '../../context/NotificationContext';
import {
  getSalarySlipDetail, listMyPayslips,
} from '../../services/hrPayrollApi';
import { fmtCurrency, fmtDate } from '../../utils/format';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { printErpFormat } from '../../utils/printErpFormat';

const STATUS_TONE = { Draft: 'default', Submitted: 'amber', Paid: 'green', Cancelled: 'red' };

export default function MyPayslipPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewSlip, setViewSlip] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listMyPayslips({ limit: 60 }));
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openView = async (row) => {
    setViewLoading(true);
    setViewSlip({ name: row.name, loading: true });
    try {
      const d = await getSalarySlipDetail(row.name);
      setViewSlip(d);
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
      setViewSlip(null);
    } finally {
      setViewLoading(false);
    }
  };

  const doPrint = (row) => {
    printErpFormat({ doctype: 'Salary Slip', name: row.name, format: 'Elmahdi Payslip' });
  };

  const columns = [
    { key: 'start_date', label: t('hr.payroll.colPeriod', { defaultValue: 'Period' }),
      render: (v, r) => `${fmtDate(v)} → ${fmtDate(r.end_date)}` },
    { key: 'gross_pay', label: t('hr.payroll.colGross', { defaultValue: 'Gross' }),
      render: (v) => <span className="mono">{fmtCurrency(v)}</span> },
    { key: 'total_deduction', label: t('hr.payroll.colDeductions', { defaultValue: 'Deductions' }),
      render: (v) => <span className="mono">{fmtCurrency(v)}</span> },
    { key: 'net_pay', label: t('hr.payroll.colNet', { defaultValue: 'Net' }),
      render: (v) => <strong className="mono">{fmtCurrency(v)}</strong> },
    { key: 'status', label: t('hr.payroll.colStatus', { defaultValue: 'Status' }),
      render: (v, r) => {
        const s = v || (r.docstatus === 1 ? 'Submitted' : 'Draft');
        return <Badge color={STATUS_TONE[s] || 'default'}>
          {t(`hr.payroll.status.${s}`, { defaultValue: s })}
        </Badge>;
      } },
    { key: 'actions', label: t('ui.table.actions', { defaultValue: 'Actions' }),
      render: (_v, row) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn variant="ghost" size="sm" onClick={() => openView(row)}>
            {t('common.view', { defaultValue: 'View' })}
          </Btn>
          <Btn variant="ghost" size="sm" onClick={() => doPrint(row)}>
            {t('common.print', { defaultValue: 'Print' })}
          </Btn>
        </div>
      ) },
  ];

  return (
    <TablePageLayout>
      <PageHeader
        title={t('hr.myPayslip.title', { defaultValue: 'My Payslips' })}
        subtitle={t('hr.myPayslip.subtitle', { defaultValue: 'Your salary slips and history' })}
        dense
      />

      {loading ? (
        <PageLoading size={22} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="💼"
          title={t('hr.myPayslip.empty', { defaultValue: 'No payslips yet' })}
          desc={t('hr.myPayslip.emptyDesc', { defaultValue: 'When HR generates payroll your slips will appear here.' })}
        />
      ) : (
        <LayoutSection variant="raised" flushHead>
          <Table columns={columns} data={rows} />
        </LayoutSection>
      )}

      <Modal
        open={!!viewSlip}
        onClose={() => setViewSlip(null)}
        size="lg"
        title={viewSlip?.name || t('hr.payroll.viewTitle', { defaultValue: 'Salary slip' })}
        footer={viewSlip && !viewSlip.loading ? (
          <Btn variant="primary" size="md"
            onClick={() => printErpFormat({ doctype: 'Salary Slip', name: viewSlip.name, format: 'Elmahdi Payslip' })}>
            {t('common.print', { defaultValue: 'Print' })}
          </Btn>
        ) : null}
      >
        {viewLoading || viewSlip?.loading ? (
          <PageLoading size={22} />
        ) : viewSlip ? (
          <div>
            <p style={{ margin: '0 0 8px' }}><strong>{viewSlip.employee_name || viewSlip.employee}</strong></p>
            <p style={{ margin: '0 0 16px', color: 'var(--text-2)', fontSize: '0.86rem' }}>
              {fmtDate(viewSlip.start_date)} → {fmtDate(viewSlip.end_date)}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <h4 style={{ marginTop: 0 }}>{t('hr.payroll.earnings', { defaultValue: 'Earnings' })}</h4>
                <ul style={{ padding: 0, listStyle: 'none', margin: 0 }}>
                  {(viewSlip.earnings || []).map((e, i) => (
                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{e.salary_component}</span>
                      <span className="mono">{fmtCurrency(e.amount)}</span>
                    </li>
                  ))}
                  <li style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', marginTop: 4, fontWeight: 600 }}>
                    <span>{t('hr.payroll.gross', { defaultValue: 'Gross' })}</span>
                    <span className="mono">{fmtCurrency(viewSlip.gross_pay)}</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 style={{ marginTop: 0 }}>{t('hr.payroll.deductions', { defaultValue: 'Deductions' })}</h4>
                {(viewSlip.deductions || []).length === 0 ? (
                  <p style={{ color: 'var(--text-3)' }}>—</p>
                ) : (
                  <ul style={{ padding: 0, listStyle: 'none', margin: 0 }}>
                    {(viewSlip.deductions || []).map((e, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span>{e.salary_component}</span>
                        <span className="mono">{fmtCurrency(e.amount)}</span>
                      </li>
                    ))}
                    <li style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', marginTop: 4, fontWeight: 600 }}>
                      <span>{t('hr.payroll.totalDeduction', { defaultValue: 'Total deductions' })}</span>
                      <span className="mono">{fmtCurrency(viewSlip.total_deduction)}</span>
                    </li>
                  </ul>
                )}
              </div>
            </div>
            <p style={{ marginTop: 16, padding: 12, background: 'var(--bg-3)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
              <strong>{t('hr.payroll.netPay', { defaultValue: 'Net pay' })}</strong>
              <strong className="mono">{fmtCurrency(viewSlip.net_pay)}</strong>
            </p>
          </div>
        ) : null}
      </Modal>
    </TablePageLayout>
  );
}
