/**
 * Operational user templates → ERPNext Role Profiles.
 * Single source of truth for frontend provisioning (no manual role assignment).
 */

export const OPERATIONAL_USER_TEMPLATES = {
  cashier: {
    id: 'cashier',
    label: 'Cashier',
    roleProfileName: 'Elmahdi Cashier',
    warehouseRule: 'exactly_one',
    requiresPriceList: true,
  },
  inventory_clerk: {
    id: 'inventory_clerk',
    label: 'Inventory Clerk',
    roleProfileName: 'Elmahdi Inventory Clerk',
    warehouseRule: 'one_or_more',
    requiresPriceList: false,
  },
  purchasing_officer: {
    id: 'purchasing_officer',
    label: 'Purchasing Officer',
    roleProfileName: 'Elmahdi Purchasing Officer',
    warehouseRule: 'one_or_more',
    requiresPriceList: false,
  },
  store_manager: {
    id: 'store_manager',
    label: 'Store Manager',
    roleProfileName: 'Elmahdi Store Manager',
    warehouseRule: 'one_or_more',
    requiresPriceList: false,
  },
  accountant: {
    id: 'accountant',
    label: 'Accountant',
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
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateProvisioningInput(templateId, input = {}) {
  const template = getTemplateById(templateId);
  if (!template) {
    return { valid: false, error: 'Select an operational role template.' };
  }

  const warehouses = (input.warehouses || []).filter(Boolean);
  const priceList = (input.priceList || '').trim();
  const company = (input.company || '').trim();

  if (template.warehouseRule === 'exactly_one') {
    if (warehouses.length !== 1) {
      return { valid: false, error: `${template.label} requires exactly one warehouse.` };
    }
  } else if (template.warehouseRule !== 'none' && warehouses.length < 1) {
    return { valid: false, error: `Select at least one warehouse for ${template.label}.` };
  }

  if (template.requiresPriceList && !priceList) {
    return { valid: false, error: `${template.label} requires a price list.` };
  }

  if (!company) {
    return { valid: false, error: 'Company is required.' };
  }

  return { valid: true };
}
