/**
 * HR Payroll — thin client over elmahdi.api.hr_payroll.
 */
import api from './api';

const BASE = '/api/method/elmahdi.api.hr_payroll';

export const SLIP_STATUSES = ['Draft', 'Submitted', 'Paid', 'Cancelled'];

export async function listSalarySlips({ employee, year, month, status, branch, limit } = {}) {
  const res = await api.get(`${BASE}.list_salary_slips`, {
    params: {
      employee: employee || undefined,
      year: year || undefined,
      month: month || undefined,
      status: status || undefined,
      branch: branch || undefined,
      limit: limit || 200,
    },
  });
  return res.data?.message || [];
}

export async function getPayrollKpis({ year, month } = {}) {
  const res = await api.get(`${BASE}.get_payroll_kpis`, {
    params: { year: year || undefined, month: month || undefined },
  });
  return res.data?.message || { draft: 0, submitted: 0, paid: 0,
                                total_gross: 0, total_net: 0, total_deduction: 0 };
}

export async function listSalaryStructures() {
  const res = await api.get(`${BASE}.list_salary_structures`);
  return res.data?.message || [];
}

export async function getSalarySlipDetail(name) {
  const res = await api.get(`${BASE}.get_salary_slip_detail`, { params: { name } });
  return res.data?.message;
}

export async function listMyPayslips({ limit } = {}) {
  const res = await api.get(`${BASE}.list_my_payslips`, {
    params: { limit: limit || 60 },
  });
  return res.data?.message || [];
}

export async function assignSalaryStructure({ employee, structure, base, fromDate }) {
  const res = await api.post(`${BASE}.assign_salary_structure`, {
    employee, structure, base,
    from_date: fromDate || undefined,
  });
  return res.data?.message;
}

export async function generateMonthlyPayroll({ year, month, branch, structure }) {
  const res = await api.post(`${BASE}.generate_monthly_payroll`, {
    year, month,
    branch: branch || undefined,
    structure: structure || undefined,
  });
  return res.data?.message;
}

export async function submitSalarySlip(name) {
  const res = await api.post(`${BASE}.submit_salary_slip`, { name });
  return res.data?.message;
}

export async function markSlipPaid(name, paymentEntry) {
  const res = await api.post(`${BASE}.mark_slip_paid`, {
    name,
    payment_entry: paymentEntry || undefined,
  });
  return res.data?.message;
}

export async function cancelSalarySlip(name) {
  const res = await api.post(`${BASE}.cancel_salary_slip`, { name });
  return res.data?.message;
}
