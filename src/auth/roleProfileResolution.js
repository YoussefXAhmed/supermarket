/**
 * Role Profile name normalization and ERP-role → profile inference.
 */

import { OPERATIONAL_USER_TEMPLATES } from './operationalUserTemplates';
import { CAPS_BY_ROLE_PROFILE } from './capabilityProfiles';

export function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

/** Case-insensitive Role Profile → canonical Elmahdi profile name */
export function resolveRoleProfileKey(roleProfileName = '') {
  const trimmed = String(roleProfileName || '').trim();
  if (!trimmed) return '';

  if (CAPS_BY_ROLE_PROFILE[trimmed]) return trimmed;

  const lower = trimmed.toLowerCase();
  const byExact = Object.keys(CAPS_BY_ROLE_PROFILE).find((k) => k.toLowerCase() === lower);
  if (byExact) return byExact;

  const byLabel = Object.values(OPERATIONAL_USER_TEMPLATES).find(
    (t) => t.label.toLowerCase() === lower,
  );
  if (byLabel) return byLabel.roleProfileName;

  return '';
}

/**
 * ERP roles commonly assigned per Elmahdi template (for inference when profile field is empty).
 * Used only when exactly one template matches.
 */
const TEMPLATE_ERP_ROLE_SIGNATURES = {
  [OPERATIONAL_USER_TEMPLATES.cashier.roleProfileName]: [
    'pos user',
    'cashier',
    'sales user',
  ],
  [OPERATIONAL_USER_TEMPLATES.inventory_clerk.roleProfileName]: [
    'stock user',
    'warehouse user',
  ],
  [OPERATIONAL_USER_TEMPLATES.purchasing_officer.roleProfileName]: [
    'purchase user',
    'purchase manager',
  ],
  [OPERATIONAL_USER_TEMPLATES.store_manager.roleProfileName]: [
    'stock manager',
    'purchase manager',
    'sales manager',
    'pos manager',
  ],
  [OPERATIONAL_USER_TEMPLATES.accountant.roleProfileName]: [
    'accounts user',
    'accounts manager',
  ],
  [OPERATIONAL_USER_TEMPLATES.hr_officer.roleProfileName]: ['elmahdi hr user'],
};

/**
 * Infer Elmahdi profile from ERP role names when role_profile_name is missing on User.
 * @param {string[]} roleList
 * @returns {string} canonical profile name or ''
 */
export function inferProfileFromRoles(roleList = []) {
  const normalized = new Set(roleList.map(normalizeRole).filter(Boolean));
  if (!normalized.size) return '';

  const matches = Object.entries(TEMPLATE_ERP_ROLE_SIGNATURES)
    .map(([profile, signature]) => {
      const hits = signature.filter((r) => normalized.has(r));
      return { profile, hits: hits.length, signature };
    })
    .filter((m) => m.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  if (!matches.length) return '';

  const top = matches[0];
  if (matches.length > 1 && matches[1].hits === top.hits) {
    return '';
  }

  return top.profile;
}
