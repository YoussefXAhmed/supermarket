/**
 * Operational user templates → ERPNext Role Profiles.
 * Single source of truth for frontend provisioning (no manual role assignment).
 *
 * Label keys map to templates.* i18n namespace.
 * Validation errors must be translated at the call-site using t(key, { label }).
 */

export const OPERATIONAL_USER_TEMPLATES = {
  cashier: {
    id: 'cashier',
    label: 'Cashier',
    labelKey: 'templates.cashier',
    roleProfileName: 'Elmahdi Cashier',
    warehouseRule: 'exactly_one',
    requiresPriceList: true,
  },
  inventory_clerk: {
    id: 'inventory_clerk',
    label: 'Inventory Clerk',
    labelKey: 'templates.inventoryClerk',
    roleProfileName: 'Elmahdi Inventory Clerk',
    warehouseRule: 'one_or_more',
    requiresPriceList: false,
  },
  purchasing_officer: {
    id: 'purchasing_officer',
    label: 'Purchasing Officer',
    labelKey: 'templates.purchasingOfficer',
    roleProfileName: 'Elmahdi Purchasing Officer',
    warehouseRule: 'one_or_more',
    requiresPriceList: false,
  },
  store_manager: {
    id: 'store_manager',
    label: 'Store Manager',
    labelKey: 'templates.storeManager',
    roleProfileName: 'Elmahdi Store Manager',
    warehouseRule: 'one_or_more',
    requiresPriceList: false,
  },
  accountant: {
    id: 'accountant',
    label: 'Accountant',
    labelKey: 'templates.accountant',
    roleProfileName: 'Elmahdi Accountant',
    warehouseRule: 'none',
    requiresPriceList: false,
  },
};

export const TEMPLATE_IDS = Object.keys(OPERATIONAL_USER_TEMPLATES);

export function getTemplateById(templateId) {
  return OPERATIONAL_USER_TEMPLATES[templateId] || null;
}

export function getTemplateByRoleProfile(roleProfileName) {
  if (!roleProfileName) return null;
  const trimmed = String(roleProfileName).trim();
  const exact = Object.values(OPERATIONAL_USER_TEMPLATES).find(
    (t) => t.roleProfileName === trimmed,
  );
  if (exact) return exact;
  const lower = trimmed.toLowerCase();
  return (
    Object.values(OPERATIONAL_USER_TEMPLATES).find(
      (t) =>
        t.roleProfileName.toLowerCase() === lower || t.label.toLowerCase() === lower,
    ) || null
  );
}

/**
 * @param {string} templateId
 * @param {{ warehouses?: string[], priceList?: string, company?: string }} input
 * @param {Function} [t] - i18next t function; falls back to English strings if omitted
 * @returns {{ valid: boolean, error?: string, errorKey?: string, errorVars?: object }}
 */
export function validateProvisioningInput(templateId, input = {}, t) {
  const template = getTemplateById(templateId);
  if (!template) {
    return {
      valid: false,
      error: t ? t('templates.selectTemplate') : 'Select an operational role template.',
      errorKey: 'templates.selectTemplate',
    };
  }

  const warehouses = (input.warehouses || []).filter(Boolean);
  const priceList = (input.priceList || '').trim();
  const company = (input.company || '').trim();
  const label = t ? t(template.labelKey) : template.label;

  if (template.warehouseRule === 'exactly_one') {
    if (warehouses.length !== 1) {
      return {
        valid: false,
        error: t ? t('templates.exactlyOneWarehouse', { label }) : `${label} requires exactly one warehouse.`,
        errorKey: 'templates.exactlyOneWarehouse',
        errorVars: { label },
      };
    }
  } else if (template.warehouseRule !== 'none' && warehouses.length < 1) {
    return {
      valid: false,
      error: t ? t('templates.atLeastOneWarehouse', { label }) : `Select at least one warehouse for ${label}.`,
      errorKey: 'templates.atLeastOneWarehouse',
      errorVars: { label },
    };
  }

  if (template.requiresPriceList && !priceList) {
    return {
      valid: false,
      error: t ? t('templates.requiresPriceList', { label }) : `${label} requires a price list.`,
      errorKey: 'templates.requiresPriceList',
      errorVars: { label },
    };
  }

  if (!company) {
    return {
      valid: false,
      error: t ? t('templates.companyRequired') : 'Company is required.',
      errorKey: 'templates.companyRequired',
    };
  }

  return { valid: true };
}
