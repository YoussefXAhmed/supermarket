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
  { to: '/manager/reports', labelKey: 'nav.reports', icon: 'reports', cap: 'canViewReports' },
  { to: '/finance/general-ledger', labelKey: 'nav.generalLedger', icon: 'finance', cap: 'canViewGLReadOnly' },
  { to: '/manager/shifts/history', labelKey: 'nav.shifts', icon: 'shifts', cap: 'canViewShiftReports' },
  { to: '/manager/suppliers', labelKey: 'nav.suppliers', icon: 'suppliers', cap: 'canViewSuppliers' },
  { to: '/pos/settings', labelKey: 'nav.posWorkspaceSettings', icon: '⚙️', cap: 'canManagePOSProfiles' },
  { to: '/inventory/settings', labelKey: 'nav.inventoryWorkspaceSettings', icon: '⚙️', cap: 'canManageInventorySettings' },
  { to: '/purchasing/settings', labelKey: 'nav.purchasingWorkspaceSettings', icon: '⚙️', cap: 'canManagePurchasingSettings' },
];

/** @param {import('./capabilities').Capabilities} capabilities */
export function getManagerNavItems(capabilities) {
  return filterNavPool(capabilities, MANAGER_NAV);
}

// ── Accountant / finance ────────────────────────────────────────────────────

/** @type {NavItem[]} */
export const FINANCE_NAV = [
  { to: '/finance', labelKey: 'nav.finance', icon: 'finance', exact: true },
  { to: '/finance/matching', labelKey: 'nav.invoiceMatching', icon: 'invoices', cap: 'canAccessInvoiceMatching' },
  { to: '/finance/payments', labelKey: 'nav.supplierPayments', icon: 'payments', cap: 'canViewSupplierPayments' },
  { to: '/finance/general-ledger', labelKey: 'nav.generalLedger', icon: 'reports', caps: ['canViewSupplierPayments', 'canAccessAccountantWorkspace'] },
  { to: '/finance/aging', labelKey: 'nav.apAging', icon: 'reports', caps: ['canViewSupplierPayments', 'canAccessAccountantWorkspace'] },
  { to: '/finance/top-suppliers', labelKey: 'nav.topSuppliers', icon: 'suppliers', caps: ['canViewSupplierPayments', 'canAccessAccountantWorkspace'] },
  { to: '/finance/approvals', labelKey: 'nav.approvals', icon: 'approvals', cap: 'canViewApprovalsDashboard' },
  { to: '/finance/invoices', labelKey: 'common.invoices', icon: 'invoices', cap: 'canViewInvoices' },
  { to: '/finance/reports', labelKey: 'nav.reports', icon: 'reports', cap: 'canViewReports' },
  { to: '/finance/shifts/history', labelKey: 'nav.shifts', icon: 'shifts', cap: 'canViewShiftReports' },
  { to: '/finance/ledger', labelKey: 'nav.ledger', icon: 'inventory', cap: 'canViewStockLedgerReadOnly' },
  { to: '/finance/settings', labelKey: 'nav.workspaceSettings', icon: '⚙️', cap: 'canManageFinanceSettings' },
];

/** @param {import('./capabilities').Capabilities} capabilities */
export function getFinanceNavItems(capabilities) {
  return filterNavPool(capabilities, FINANCE_NAV);
}

// ── HR ────────────────────────────────────────────────────────────────────────

/** @type {NavItem[]} */
export const HR_NAV = [
  { to: '/hr', labelKey: 'nav.hrOverview', icon: 'dashboard', exact: true, cap: 'canAccessHRWorkspace' },
  { to: '/hr/employees', labelKey: 'nav.employees', icon: 'customers', cap: 'canViewEmployees' },
  { to: '/hr/attendance', labelKey: 'nav.attendance', icon: 'calendar', caps: ['canManageAttendance', 'canViewHRReports'] },
  { to: '/hr/leave', labelKey: 'nav.leave', icon: 'approvals', caps: ['canApproveLeave', 'canRequestLeave', 'canViewHRReports'] },
  { to: '/hr/payroll', labelKey: 'nav.payroll', icon: 'finance', caps: ['canManagePayroll', 'canViewHRReports'] },
  { to: '/my-payslip', labelKey: 'nav.myPayslip', icon: 'user', cap: 'canViewPayslipSelf' },
  { to: '/hr/users', labelKey: 'nav.systemUsers', icon: 'user', cap: 'canManageOperationalUsers' },
  // Phase 4-hotfix: removed /hr/departments and /hr/positions — the
  // SPA routes were never registered, so clicking either navigated
  // to the catch-all and signed users out. Restore these entries
  // when the matching pages ship.
  { to: '/hr/settings', labelKey: 'nav.workspaceSettings', icon: '⚙️', cap: 'canManageHRSettings' },
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
  { to: '/inventory/items', labelKey: 'nav.items', icon: '📦' },
  { to: '/inventory/transfer', labelKey: 'nav.transfer', icon: '🔁', cap: 'canInventoryIssueTransfer' },
  { to: '/inventory/alerts', labelKey: 'nav.alerts', icon: '⚠' },
  { to: '/inventory/reorder', labelKey: 'nav.reorder', icon: '🛒' },
  { to: '/inventory/ledger', labelKey: 'nav.ledger', icon: '📒' },
];

/** @type {NavItem[]} */
const INVENTORY_NAV_FULL = [
  ...INVENTORY_NAV_CLERK,
  { to: '/inventory/batches', labelKey: 'nav.batches', icon: '🧪', cap: 'canInventoryManage' },
  { to: '/inventory/reconciliation', labelKey: 'nav.reconcile', icon: '⚖', cap: 'canInventoryReconcile' },
  { to: '/inventory/analytics', labelKey: 'nav.analytics', icon: '📈', cap: 'canInventoryAnalytics' },
  { to: '/inventory/reports', labelKey: 'nav.reports', icon: '📊', cap: 'canInventoryManage' },
  { to: '/inventory/settings', labelKey: 'nav.workspaceSettings', icon: '⚙️', cap: 'canManageInventorySettings' },
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
  { to: '/purchasing/settings', labelKey: 'nav.workspaceSettings', icon: '⚙️', cap: 'canManagePurchasingSettings' },
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

// ── Unified session-menu registry (Phase 3.5.b) ─────────────────────────────
//
// Single source of truth for the workspace footer / topbar UserMenu link
// list. Canonical order per decision D4:
//
//   1. Personal Settings  — every authenticated user
//   2. My Payslip         — gated on canViewPayslipSelf
//   3. Workspace-specific — varies by workspace (System Settings for admin
//                           if canManageSettings, Returns + Shift Control
//                           for POS cashiers, Admin/POS jump for inventory
//                           non-clerks, etc.)
//   4. Logout             — NOT in this list. Sign out is added by the
//                           UserMenu primitive via the onSignOut prop.
//
// Workspaces previously each built their own session-link arrays inline,
// which is why Admin and HR users never saw Personal Settings while
// Finance users did. This function closes audit findings 11.3 + 11.4.

/**
 * @param {import('./capabilities').Capabilities} capabilities
 * @param {'admin'|'hr'|'finance'|'manager'|'purchasing'|'inventory'|'shifts'|'pos'} workspaceId
 * @param {{ inAdminShell?: boolean }} [opts]
 * @returns {{ to: string, labelKey: string }[]}
 */
export function getSessionLinksForWorkspace(capabilities, workspaceId, opts = {}) {
  const links = [];

  // 1. Personal Settings — uniform entry across every workspace.
  links.push({ to: '/me/profile', labelKey: 'nav.personalSettings' });

  // 2. My Payslip — only when the user has a payslip.
  if (hasCapability(capabilities, 'canViewPayslipSelf')) {
    links.push({ to: '/my-payslip', labelKey: 'nav.myPayslip' });
  }

  // 3. Workspace-specific links.
  switch (workspaceId) {
    case 'admin':
      if (hasCapability(capabilities, 'canManageSettings')) {
        links.push({ to: '/admin/settings', labelKey: 'nav.systemSettings' });
      }
      break;
    case 'inventory':
      links.push(...getInventorySessionLinks(capabilities));
      break;
    case 'shifts':
      links.push(...getShiftsSessionLinks(capabilities, opts.inAdminShell));
      break;
    case 'pos':
      links.push(...getPOSSessionLinks(capabilities));
      break;
    // hr / finance / manager / purchasing — no workspace-specific links today.
    default:
      break;
  }

  return links;
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
  return canEditItemMaster(capabilities);
}

/**
 * Can edit item details (name, group, brand, barcode, image, thresholds,
 * batch tracking, enable/disable) — Administrator + Store Manager.
 *
 * Pricing fields are split out and require `canEditItemPricing`.
 * @param {import('./capabilities').Capabilities} capabilities
 */
export function canEditItemMaster(capabilities) {
  if (hasCapability(capabilities, 'canManageSystem')) return true;
  const persona = resolveNavPersona(capabilities);
  if (persona === 'administrator') return true;
  if (persona === 'store_manager') return true;
  return false;
}

/**
 * Can change the selling (retail) price on an item — Administrator OR
 * Store Manager. Mirrors `canEditItemMaster` since both personas already
 * own the broader item record; selling price moves with the rest of the
 * commercial fields.
 * @param {import('./capabilities').Capabilities} capabilities
 */
export function canEditSellingPrice(capabilities) {
  return canEditItemMaster(capabilities);
}

/**
 * Can change the buying (cost) price on an item — Administrator ONLY.
 * Cost data is restricted to break-glass / governance personas so that
 * store managers cannot manipulate margin inputs.
 * @param {import('./capabilities').Capabilities} capabilities
 */
export function canEditBuyingPrice(capabilities) {
  if (hasCapability(capabilities, 'canManageSystem')) return true;
  return resolveNavPersona(capabilities) === 'administrator';
}

/**
 * Can create / edit / enable-disable suppliers — Administrator + Store Manager.
 * Read-only for everyone else (Inventory Clerk, Purchasing Officer, Accountant,
 * Cashier, HR). Backend enforces the same rule via Supplier doc_events.
 * @param {import('./capabilities').Capabilities} capabilities
 */
export function canManageSuppliers(capabilities) {
  if (hasCapability(capabilities, 'canManageSystem')) return true;
  const persona = resolveNavPersona(capabilities);
  if (persona === 'administrator') return true;
  if (persona === 'store_manager') return true;
  return false;
}

/**
 * Can delete a supplier — Administrator + Store Manager. The backend still
 * rejects the delete with `LinkExistsError` if the supplier has any linked
 * Purchase Receipt / Purchase Invoice / Payment Entry, regardless of role.
 * @param {import('./capabilities').Capabilities} capabilities
 */
export function canDeleteSuppliers(capabilities) {
  if (hasCapability(capabilities, 'canManageSystem')) return true;
  const persona = resolveNavPersona(capabilities);
  if (persona === 'administrator') return true;
  if (persona === 'store_manager') return true;
  return false;
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
