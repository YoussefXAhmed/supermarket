/**
 * System Settings API — Phase 3.
 *
 * Thin client over the Frappe whitelisted endpoints in
 * elmahdi.api.system_settings + system_settings_aux + settings_audit.
 *
 * All endpoints are Administrator-only (server-side gate). The SPA gate
 * is `canManageSystem` on the route.
 */
import api from './api';

const SYS = '/api/method/elmahdi.api.system_settings';
const AUX = '/api/method/elmahdi.api.system_settings_aux';
const AUD = '/api/method/elmahdi.api.settings_audit';

// ── catalog ──────────────────────────────────────────────────────────────

export async function listSections() {
  const res = await api.get(`${SYS}.list_sections`);
  return res.data?.message || [];
}

export async function getSection(section) {
  const res = await api.get(`${SYS}.get_section`, { params: { section } });
  return res.data?.message || { section, deep_link: false, blocks: [] };
}

export async function updateSection(section, payload) {
  const res = await api.post(`${SYS}.update_section`, {
    section,
    payload: JSON.stringify(payload || {}),
  });
  return res.data?.message || { applied: [], skipped: [] };
}

// ── audit ────────────────────────────────────────────────────────────────

export async function getAuditLog({ section, settingField, fromDate, toDate, limit } = {}) {
  const res = await api.get(`${AUD}.get_audit_log`, {
    params: {
      section: section || undefined,
      setting_field: settingField || undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      limit: limit || 200,
    },
  });
  return res.data?.message || [];
}

// ── company ──────────────────────────────────────────────────────────────

export async function listCompanies() {
  const res = await api.get(`${AUX}.list_companies`);
  return res.data?.message || [];
}

export async function getCompany(name) {
  const res = await api.get(`${AUX}.get_company`, { params: { name } });
  return res.data?.message || null;
}

export async function updateCompany(name, payload) {
  const res = await api.post(`${AUX}.update_company`, {
    name,
    payload: JSON.stringify(payload || {}),
  });
  return res.data?.message;
}

export async function updateCompanyLogo(company, logoUrl) {
  const res = await api.post(`${AUX}.update_company_logo`, {
    company,
    logo_url: logoUrl,
  });
  return res.data?.message;
}

// ── backup ───────────────────────────────────────────────────────────────

export async function getBackupStatus() {
  const res = await api.get(`${AUX}.get_backup_status`);
  return res.data?.message || {};
}

export async function triggerBackupNow() {
  const res = await api.post(`${AUX}.trigger_backup_now`, {});
  return res.data?.message;
}

// ── feature flags ────────────────────────────────────────────────────────

export async function getFeatureFlags() {
  const res = await api.get(`${AUX}.get_feature_flags`);
  return res.data?.message || {};
}

export async function setFeatureFlag(flag, enabled) {
  const res = await api.post(`${AUX}.set_feature_flag`, {
    flag,
    enabled: enabled ? 1 : 0,
  });
  return res.data?.message;
}

// ── auxiliary ────────────────────────────────────────────────────────────

export async function getCapabilityMatrix() {
  const res = await api.get(`${AUX}.get_capability_matrix`);
  return res.data?.message || { role_profiles: [], caps_by_profile: {} };
}

export async function listLetterHeads() {
  const res = await api.get(`${AUX}.list_letter_heads`);
  return res.data?.message || [];
}

export async function listPrintFormats() {
  const res = await api.get(`${AUX}.list_print_formats`);
  return res.data?.message || [];
}

/** Stable order used by the left rail. */
export const SECTION_ORDER = [
  'company', 'branches', 'users-roles', 'products', 'pricing',
  'inventory', 'finance', 'notifications', 'printing', 'security',
  'backup', 'feature-flags',
];
