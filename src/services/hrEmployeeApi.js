/**
 * HR workforce — ERPNext Employee via whitelisted API + REST mutations.
 */

import api from './api';
import { getDefaultCompany } from './userManagementApi';
import {
  buildEmployeePayload,
  normalizeEmployee,
  spaStatusToErpStatus,
} from '../utils/hrEmployees';

/** Fields allowed on this site's Employee DocType (REST writes). */
const EMPLOYEE_REST_FIELDS = [
  'name',
  'employee',
  'employee_name',
  'first_name',
  'cell_number',
  'passport_number',
  'current_address',
  'permanent_address',
  'department',
  'designation',
  'date_of_joining',
  'status',
  'user_id',
  'company',
  'personal_email',
  'company_email',
  'creation',
  'modified',
];

export async function listEmployees({ limit = 200, start = 0 } = {}) {
  const res = await api.get('/api/method/elmahdi.api.hr_workforce.list_employees', {
    params: { limit, start },
  });
  const rows = res.data?.message || [];
  return rows.map(normalizeEmployee).filter(Boolean);
}

export async function getEmployee(name) {
  const res = await api.get(`/api/resource/Employee/${encodeURIComponent(name)}`, {
    params: { fields: JSON.stringify(EMPLOYEE_REST_FIELDS) },
  });
  return normalizeEmployee(res.data?.data);
}

export async function createEmployee(form) {
  const company = form.company || (await getDefaultCompany());
  if (!company) {
    const err = new Error('No company configured in ERPNext.');
    err.code = 'VALIDATION';
    throw err;
  }
  const payload = buildEmployeePayload(form, company);
  const res = await api.post('/api/resource/Employee', payload);
  return normalizeEmployee(res.data?.data);
}

export async function updateEmployee(name, form) {
  const payload = buildEmployeePayload(form, form.company);
  delete payload.company;
  if (!form.employee_id) delete payload.employee;
  const res = await api.put(`/api/resource/Employee/${encodeURIComponent(name)}`, payload);
  return normalizeEmployee(res.data?.data);
}

export async function setEmployeeStatus(name, employmentStatus) {
  const res = await api.put(`/api/resource/Employee/${encodeURIComponent(name)}`, {
    status: spaStatusToErpStatus(employmentStatus),
  });
  return normalizeEmployee(res.data?.data);
}

export async function linkEmployeeToUser(employeeName, userId) {
  const res = await api.put(`/api/resource/Employee/${encodeURIComponent(employeeName)}`, {
    user_id: userId,
  });
  return normalizeEmployee(res.data?.data);
}

export async function unlinkEmployeeUser(employeeName) {
  const res = await api.put(`/api/resource/Employee/${encodeURIComponent(employeeName)}`, {
    user_id: '',
  });
  return normalizeEmployee(res.data?.data);
}

/** Dashboard aggregate — employees + operational users (role profiles). */
export async function getWorkforceSnapshot() {
  const res = await api.get('/api/method/elmahdi.api.hr_workforce.get_workforce_snapshot', {
    params: { limit: 500 },
  });
  const msg = res.data?.message || {};
  const employees = (msg.employees || []).map(normalizeEmployee).filter(Boolean);
  const users = msg.users || [];
  return { employees, users };
}

export async function listDepartments() {
  const res = await api.get('/api/method/elmahdi.api.hr_workforce.list_departments');
  return res.data?.message || [];
}

export async function listDesignations() {
  const res = await api.get('/api/method/elmahdi.api.hr_workforce.list_designations');
  return res.data?.message || [];
}
