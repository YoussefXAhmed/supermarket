/**
 * Centralized navigation — strict persona isolation.
 * Operational roles never inherit administrator nav pools.
 */

import { hasCapability } from './capabilities';

/** @typedef {{ to: string, labelKey: string, icon?: string, exact?: boolean, cap?: string, caps?: string[] }} NavItem */

/** @param {import('./capabilities').Capabilities} capabilities */
export function resolveNavPersona(capabilities) {
  if (hasCapability(capabilities, 'canManageSystem')) return 'administrator';
  const persona = capabilities.operationalPersona || '';
  if (persona === 'hr' && hasCapability(capabilities, 'canAccessHRWorkspace')) return 'hr';
  if (persona === 'store_manager' && hasCapability(capabilities, 'canAccessManagerWorkspace')) {
    return 'store_manager';
  }
  if (persona === 'accountant' && hasCapability(capabilities, 'canAccessAccountantWorkspace')) {
    return 'accountant';
  }
  if (persona === 'purchasing' && hasCapability(capabilities, 'canAccessPurchasing')) return 'purchasing';
  if (persona === 'inventory' && hasCapability(capabilities, 'canAccessInventory')) return 'inventory';
  if (persona === 'cashier') return 'cashier';
  return persona || 'default';
}

/** @param {import('./capabilities').Capabilities} capabilities @param {NavItem} item */
function navItemVisible(capabilities, item) {
  if (item.caps?.length) return item.caps.some((c) => hasCapability(capabilities, c));
  if (item.cap) return hasCapability(capabilities, item.cap);
  return true;
}

/** @param {import('./capabilities').Capabilities} capabilities @param {NavItem[]} pool */
export function filterNavPool(capabilities, pool) {
  return pool.filter((item) => navItemVisible(capabilities, item));
}

// ── Administrator only ──────────────────────────────────────────────────────

/** @type {NavItem[]} */
export const ADMIN_NAV = [
  { to: '/admin', labelKey: 'nav.dashboard', icon: '◈', exact: true },
  { to: '/admin/users', labelKey: 'nav.users', icon: '🧑‍💼' },
  { to: '/admin/products', labelKey: 'nav.products', icon: '🛒' },
  { to: '/admin/customers', labelKey: 'nav.customers', icon: '👥' },
  { to: '/admin/warehouses', labelKey: 'nav.warehouses', icon: '🏬' },
  { to: '/admin/pos-profiles', labelKey: 'nav.posProfiles', icon: '🖥️', cap: 'canManagePOSProfiles' },
  { to: '/admin/approvals', labelKey: 'nav.approvals', icon: '✓' },
  { to: '/admin/reports', labelKey: 'nav.reports', icon: '📊' },
  { to: '/admin/activity', labelKey: 'nav.activity', icon: '📋' },
  { to: '/admin/settings', labelKey: 'nav.settings', icon: '⚙️' },
];

/** @param {import('./capabilities').Capabilities} capabilities */
export function getAdminNavItems(capabilities) {
  if (!hasCapability(capabilities, 'canManageSystem')) return [];
  return filterNavPool(capabilities, ADMIN_NAV);
}

// ── Store manager (monitor / approve only) ──────────────────────────────────

/** @type {NavItem[]} */
export const MANAGER_NAV = [
  { to: '/manager', labelKey: 'nav.dashboard', icon: '◈', exact: true },
  { to: '/manager/approvals', labelKey: 'nav.approvals', icon: '✓', cap: 'canViewApprovalsDashboard' },
  { to: '/manager/pos-profiles', labelKey: 'nav.posProfiles', icon: '🖥️', cap: 'canManagePOSProfiles' },
  {
    to: '/manager/approvals/history',
    labelKey: 'nav.approvalHistory',
    icon: '📜',
    cap: 'canViewPurchaseApprovals',
  },
  {
    to: '/manager/purchase-approvals',
    labelKey: 'nav.purchaseApprovals',
    icon: '🛍️',
    cap: 'canViewPurchaseApprovals',
  },
  { to: '/manager/reports', labelKey: 'nav.reports', icon: '📊', cap: 'canViewReports' },
  { to: '/manager/shifts/history', labelKey: 'nav.shifts', icon: '◷', cap: 'canViewShiftReports' },
];

/** @param {import('./capabilities').Capabilities} capabilities */
export function getManagerNavItems(capabilities) {
  return filterNavPool(capabilities, MANAGER_NAV);
}

// ── Accountant / finance ────────────────────────────────────────────────────

/** @type {NavItem[]} */
export const FINANCE_NAV = [
  { to: '/finance', labelKey: 'nav.finance', icon: '💼', exact: true },
  { to: '/finance/matching', labelKey: 'nav.invoiceMatching', icon: '🧾', cap: 'canAccessInvoiceMatching' },
  { to: '/finance/payments', labelKey: 'nav.supplierPayments', icon: '💳', cap: 'canViewSupplierPayments' },
  { to: '/finance/approvals', labelKey: 'nav.approvals', icon: '✓', cap: 'canViewApprovalsDashboard' },
  { to: '/finance/invoices', labelKey: 'common.invoices', icon: '🧾', cap: 'canViewInvoices' },
  { to: '/finance/reports', labelKey: 'nav.reports', icon: '📊', cap: 'canViewReports' },
  { to: '/finance/shifts/history', labelKey: 'nav.shifts', icon: '◷', cap: 'canViewShiftReports' },
  { to: '/finance/ledger', labelKey: 'nav.ledger', icon: '📒', cap: 'canViewStockLedgerReadOnly' },
];

/** @param {import('./capabilities').Capabilities} capabilities */
export function getFinanceNavItems(capabilities) {
  return filterNavPool(capabilities, FINANCE_NAV);
}

// ── HR ────────────────────────────────────────────────────────────────────────

/** @type {NavItem[]} */
export const HR_NAV = [
  { to: '/hr', labelKey: 'nav.hrOverview', icon: '◈', exact: true, cap: 'canAccessHRWorkspace' },
  { to: '/hr/employees', labelKey: 'nav.employees', icon: '👥', cap: 'canViewEmployees' },
  { to: '/hr/users', labelKey: 'nav.systemUsers', icon: '🧑‍💼', cap: 'canManageOperationalUsers' },
  { to: '/hr/departments', labelKey: 'nav.departments', icon: '🏢', cap: 'canAccessHRWorkspace' },
  { to: '/hr/positions', labelKey: 'nav.positions', icon: '💼', cap: 'canAccessHRWorkspace' },
];

/** @param {import('./capabilities').Capabilities} capabilities */
export function getHRNavItems(capabilities) {
  return filterNavPool(capabilities, HR_NAV);
}

// ── Inventory module nav ────────────────────────────────────────────────────

/** @type {NavItem[]} */
const INVENTORY_NAV_CLERK = [
  { to: '/inventory', labelKey: 'nav.overview', icon: '◈', exact: true },
  { to: '/inventory/warehouses', labelKey: 'nav.warehouses', icon: '🏬' },
  { to: '/inventory/stock-entry', labelKey: 'nav.stockEntry', icon: '📥' },
  { to: '/inventory/transfer', labelKey: 'nav.transfer', icon: '🔁', cap: 'canInventoryIssueTransfer' },
  { to: '/inventory/alerts', labelKey: 'nav.alerts', icon: '⚠' },
  { to: '/inventory/reorder', labelKey: 'nav.reorder', icon: '🛒' },
  { to: '/inventory/ledger', labelKey: 'nav.ledger', icon: '📒' },
];

/** @type {NavItem[]} */
const INVENTORY_NAV_FULL = [
  ...INVENTORY_NAV_CLERK,
  { to: '/inventory/items', labelKey: 'nav.items', icon: '📦', cap: 'canInventoryManage' },
  { to: '/inventory/batches', labelKey: 'nav.batches', icon: '🧪', cap: 'canInventoryManage' },
  { to: '/inventory/reconciliation', labelKey: 'nav.reconcile', icon: '⚖', cap: 'canInventoryReconcile' },
  { to: '/inventory/analytics', labelKey: 'nav.analytics', icon: '📈', cap: 'canInventoryAnalytics' },
  { to: '/inventory/reports', labelKey: 'nav.reports', icon: '📊', cap: 'canInventoryManage' },
];

/** @param {import('./capabilities').Capabilities} capabilities */
export function getInventoryNavItems(capabilities) {
  const persona = resolveNavPersona(capabilities);
  const pool = persona === 'inventory' && !hasCapability(capabilities, 'canManageSystem')
    ? INVENTORY_NAV_CLERK
    : INVENTORY_NAV_FULL;
  return filterNavPool(capabilities, pool);
}

/** @param {import('./capabilities').Capabilities} capabilities */
export function getInventorySessionLinks(capabilities) {
  if (resolveNavPersona(capabilities) === 'inventory') return [];
  const links = [];
  if (hasCapability(capabilities, 'canManageSystem')) {
    links.push({ to: '/admin', labelKey: 'common.admin' });
  }
  if (hasCapability(capabilities, 'canOperatePOS')) {
    links.push({ to: '/pos', labelKey: 'common.pos' });
  }
  return links;
}

// ── Purchasing shell sidebar ────────────────────────────────────────────────

/** @type {NavItem[]} */
const PURCHASING_SHELL_OFFICER = [
  { to: '/purchasing', labelKey: 'nav.overview', icon: '◈', exact: true },
  { to: '/purchasing/suppliers', labelKey: 'nav.suppliers', icon: '🏭' },
  { to: '/purchasing/receive', labelKey: 'nav.receive', icon: '📥' },
  {
    to: '/purchasing/history',
    labelKey: 'nav.purchasingHistory',
    icon: '📜',
    cap: 'canViewPurchasingHistory',
  },
];

/** @type {NavItem[]} */
const PURCHASING_SHELL_FULL = [
  ...PURCHASING_SHELL_OFFICER,
  { to: '/purchasing/approvals', labelKey: 'nav.approvals', icon: '✓', cap: 'canViewPurchaseApprovals' },
  { to: '/purchasing/invoices', labelKey: 'common.invoices', icon: '🧾', cap: 'canAccessAccountantWorkspace' },
  { to: '/purchasing/reports', labelKey: 'nav.reports', icon: '📊', cap: 'canAccessAccountantWorkspace' },
];

/** @param {import('./capabilities').Capabilities} capabilities */
export function getPurchasingShellNavItems(capabilities) {
  const persona = resolveNavPersona(capabilities);
  const pool = persona === 'purchasing' && !hasCapability(capabilities, 'canManageSystem')
    ? PURCHASING_SHELL_OFFICER
    : PURCHASING_SHELL_FULL;
  return filterNavPool(capabilities, pool);
}

/** @deprecated use getPurchasingShellNavItems — module sub-nav for admin purchasing pages */
export function getPurchasingNavItems(capabilities) {
  return getPurchasingShellNavItems(capabilities).map((item) => ({
    ...item,
    to: item.to.replace(/^\/purchasing/, '/admin/purchasing'),
  }));
}

// ── Shifts nav ──────────────────────────────────────────────────────────────

/** @type {NavItem[]} */
const SHIFTS_NAV_CASHIER = [
  { to: 'open', labelKey: 'shifts.openShift', cap: 'canOpenShift' },
  { to: 'close', labelKey: 'shifts.closeShift', cap: 'canCloseShift' },
  { to: 'history', labelKey: 'nav.myShifts', caps: ['canViewOwnShiftHistory', 'canViewShiftReports'] },
  { to: '/pos/returns', labelKey: 'nav.returns', cap: 'canCreateReturns' },
  { to: '/pos', labelKey: 'common.pos', cap: 'canViewPOS' },
];

/** @type {NavItem[]} */
const SHIFTS_NAV_MANAGER = [
  { to: 'history', labelKey: 'nav.history', cap: 'canViewShiftReports' },
];

/** @param {import('./capabilities').Capabilities} capabilities */
export function getShiftsNavItems(capabilities) {
  const persona = resolveNavPersona(capabilities);
  if (persona === 'cashier') return filterNavPool(capabilities, SHIFTS_NAV_CASHIER);
  if (persona === 'store_manager') return filterNavPool(capabilities, SHIFTS_NAV_MANAGER);
  return filterNavPool(capabilities, SHIFTS_NAV_MANAGER);
}

/** @param {import('./capabilities').Capabilities} capabilities @param {boolean} inAdminShell */
export function getShiftsSessionLinks(capabilities, inAdminShell = false) {
  if (inAdminShell || resolveNavPersona(capabilities) === 'cashier') return [];
  if (resolveNavPersona(capabilities) === 'store_manager') {
    return [{ to: '/manager', labelKey: 'nav.manager' }];
  }
  return [];
}

// ── POS session links ───────────────────────────────────────────────────────

/** @param {import('./capabilities').Capabilities} capabilities */
export function getPOSSessionLinks(capabilities) {
  if (resolveNavPersona(capabilities) !== 'cashier') return [];
  const links = [];
  if (hasCapability(capabilities, 'canCreateReturns')) {
    links.push({ to: '/pos/returns', labelKey: 'nav.returns' });
  }
  if (
    hasCapability(capabilities, 'canOpenShift')
    || hasCapability(capabilities, 'canCloseShift')
    || hasCapability(capabilities, 'canViewOwnShiftHistory')
  ) {
    links.push({ to: '/shifts/open', labelKey: 'shifts.shiftControl' });
  }
  return links;
}

export function canAccessShiftHistory(capabilities) {
  return hasCapability(capabilities, 'canViewShiftReports') || hasCapability(capabilities, 'canViewOwnShiftHistory');
}

/** @param {import('./capabilities').Capabilities} capabilities */
export function isOwnShiftHistoryOnly(capabilities) {
  return hasCapability(capabilities, 'canViewOwnShiftHistory') && !hasCapability(capabilities, 'canViewShiftReports');
}

/** @param {import('./capabilities').Capabilities} capabilities */
export function isStrictOperationalPersona(capabilities) {
  const persona = resolveNavPersona(capabilities);
  return ['cashier', 'inventory', 'purchasing', 'store_manager', 'accountant', 'hr'].includes(persona);
}

/** @param {import('./capabilities').Capabilities} capabilities */
export function canManageItemMaster(capabilities) {
  return hasCapability(capabilities, 'canInventoryManage')
    || (hasCapability(capabilities, 'canManageSystem') && resolveNavPersona(capabilities) === 'administrator');
}

/** @param {import('./capabilities').Capabilities} capabilities */
export function canExecutePurchasingFinance(capabilities) {
  return hasCapability(capabilities, 'canAccessAccountantWorkspace');
}

/**
 * Finance surfaces hosted under the purchasing workspace — accountants get
 * these too (AP reconciliation), admins via canManageSystem. Used by
 * PurchasingDashboardPage and ReceiveStockPage to conditionally render the
 * supplier-finance widgets.
 * @param {import('./capabilities').Capabilities} capabilities
 */
export function canAccessPurchasingAdminFinance(capabilities) {
  return hasCapability(capabilities, 'canAccessAccountantWorkspace')
    || hasCapability(capabilities, 'canManageSystem');
}

/**
 * Cross-workspace finance guidance on purchasing flows (invoice matching).
 * Shown to roles that work with supplier invoices.
 * @param {import('./capabilities').Capabilities} capabilities
 */
export function canShowPurchasingFinanceGuidance(capabilities) {
  return hasCapability(capabilities, 'canAccessInvoiceMatching');
}

/** @param {import('./capabilities').Capabilities} capabilities */
export function isAdministratorPersona(capabilities) {
  return resolveNavPersona(capabilities) === 'administrator';
}

/** @param {import('./capabilities').Capabilities} capabilities */
export function isManagerMonitorOnly(capabilities) {
  return resolveNavPersona(capabilities) === 'store_manager';
}

/** @param {import('./capabilities').Capabilities} capabilities */
export function canExecuteShiftApproval(capabilities) {
  return hasCapability(capabilities, 'canExecuteShiftClosingApproval');
}
