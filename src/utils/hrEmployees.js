/** Workforce model — maps ERPNext Employee ↔ SPA employee record. */

export const EMPLOYMENT_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  RESIGNED: 'resigned',
};

const ERP_STATUS_TO_SPA = {
  Active: EMPLOYMENT_STATUS.ACTIVE,
  Inactive: EMPLOYMENT_STATUS.SUSPENDED,
  Suspended: EMPLOYMENT_STATUS.SUSPENDED,
  Left: EMPLOYMENT_STATUS.RESIGNED,
};

const SPA_STATUS_TO_ERP = {
  [EMPLOYMENT_STATUS.ACTIVE]: 'Active',
  [EMPLOYMENT_STATUS.SUSPENDED]: 'Inactive',
  [EMPLOYMENT_STATUS.RESIGNED]: 'Left',
};

export function spaStatusToErpStatus(status) {
  return SPA_STATUS_TO_ERP[status] || 'Active';
}

export function erpStatusToSpaStatus(status) {
  return ERP_STATUS_TO_SPA[String(status || '').trim()] || EMPLOYMENT_STATUS.ACTIVE;
}

/**
 * @param {object} doc ERPNext Employee row
 */
export function normalizeEmployee(doc) {
  if (!doc) return null;
  const userId = doc.user_id || doc.user || '';
  return {
    id: doc.name,
    employee_id: doc.employee || doc.name,
    full_name: doc.employee_name || doc.first_name || doc.name,
    phone: doc.cell_number || doc.mobile_no || '',
    // Prefer the Elmahdi-owned `national_id` field; fall back to legacy
    // `passport_number` for records created before the Batch A fixture.
    national_id: doc.national_id || doc.passport_number || doc.identification_document_number || '',
    // Same for address — Elmahdi field takes priority.
    address: doc.elmahdi_address || doc.current_address || doc.permanent_address || '',
    department: doc.department || '',
    position: doc.designation || '',
    branch: doc.elmahdi_branch_warehouse || '',
    reports_to: doc.reports_to || '',
    gender: doc.gender || '',
    date_of_birth: doc.date_of_birth || '',
    hire_date: doc.date_of_joining || '',
    employment_status: erpStatusToSpaStatus(doc.status),
    has_system_access: Boolean(userId),
    system_user_id: userId || null,
    company: doc.company || '',
    email: doc.personal_email || doc.company_email || '',
    created_at: doc.creation || '',
    raw: doc,
  };
}

export function buildEmployeePayload(form, company) {
  const status = spaStatusToErpStatus(form.employment_status);
  return {
    employee_name: form.full_name?.trim(),
    employee: form.employee_id?.trim() || undefined,
    cell_number: form.phone?.trim() || '',
    // Write to the dedicated `national_id` custom field. We deliberately
    // stop populating `passport_number` for new records — keep that field
    // for actual passport data going forward.
    national_id: form.national_id?.trim() || '',
    elmahdi_address: form.address?.trim() || '',
    elmahdi_branch_warehouse: form.branch || '',
    reports_to: form.reports_to || '',
    department: form.department?.trim() || '',
    designation: form.position?.trim() || '',
    date_of_joining: form.hire_date || new Date().toISOString().slice(0, 10),
    date_of_birth: form.date_of_birth || '1990-01-01',
    gender: form.gender || 'Other',
    status,
    company: company || form.company,
    personal_email: form.email?.trim() || '',
  };
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * @param {ReturnType<typeof normalizeEmployee>[]} employees
 * @param {{ name: string, role_profile_name?: string }[]} [users]
 */
export function computeWorkforceStats(employees = [], users = []) {
  const userByName = new Map(users.map((u) => [u.name, u]));
  const monthStart = monthStartIso();

  let active = 0;
  let withAccess = 0;
  let withoutAccess = 0;
  let newHires = 0;
  const byDepartment = {};
  const byRole = {};

  for (const emp of employees) {
    if (emp.employment_status === EMPLOYMENT_STATUS.ACTIVE) active += 1;
    if (emp.has_system_access) {
      withAccess += 1;
      const profile = userByName.get(emp.system_user_id)?.role_profile_name || 'Unknown';
      byRole[profile] = (byRole[profile] || 0) + 1;
    } else {
      withoutAccess += 1;
      byRole['No system access'] = (byRole['No system access'] || 0) + 1;
    }
    const dept = emp.department?.trim() || 'Unassigned';
    byDepartment[dept] = (byDepartment[dept] || 0) + 1;
    if (emp.hire_date && emp.hire_date >= monthStart) newHires += 1;
  }

  return {
    total: employees.length,
    active,
    withAccess,
    withoutAccess,
    newHires,
    byDepartment: toChartSeries(byDepartment),
    byRole: toChartSeries(byRole),
  };
}

function toChartSeries(map) {
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function employmentStatusLabel(status, t) {
  if (typeof t === 'function') {
    return t(`hr.status.${status}`, { defaultValue: status });
  }
  const labels = {
    active: 'Active',
    suspended: 'Suspended',
    resigned: 'Resigned',
  };
  return labels[status] || status;
}
