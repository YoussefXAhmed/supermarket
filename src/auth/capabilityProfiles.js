/**
 * Explicit SPA capabilities per Elmahdi Role Profile.
 * Profile wins over raw ERP role names (prevents Sales Manager → POS operate leak).
 */

import { OPERATIONAL_USER_TEMPLATES } from './operationalUserTemplates';

export const WAREHOUSE_SCOPE_EMPTY = {
  allowedWarehouses: null,
  loaded: false,
  source: 'erp',
};

/** @typedef {import('./capabilities').Capabilities} Capabilities */

/** @param {Partial<Capabilities>} caps */
function inv(caps) {
  return {
    ...caps,
    canInventoryIssueTransfer: caps.canInventoryTransfer ?? caps.canInventoryIssueTransfer ?? false,
    canInventoryViewValuation: caps.canInventoryValuation ?? caps.canInventoryViewValuation ?? false,
  };
}

const CASHIER = inv({
  canViewPOS: true,
  canOperatePOS: true,
  canOpenShift: true,
  canCloseShift: true,
  canApproveShift: false,
  canViewShiftReports: false,
  canViewInvoices: true,
  canViewReturns: true,
  canCreateReturns: true,
  canApproveReturns: false,
  roleLabel: 'Cashier',
  operationalPersona: 'cashier',
});

const INVENTORY_CLERK = inv({
  canAccessInventory: true,
  canInventoryOperate: true,
  canInventoryReceipt: true,
  roleLabel: 'Inventory Clerk',
  operationalPersona: 'inventory',
});

const PURCHASING_OFFICER = {
  canAccessPurchasing: true,
  canViewSuppliers: true,
  canApprovePurchasing: false,
  canApprovePurchasingAccountant: false,
  canViewPurchaseApprovals: false,
  canViewApprovalsDashboard: false,
  roleLabel: 'Purchasing Officer',
  operationalPersona: 'purchasing',
};

/** Future-safe: accountant reviews shift closings without full store manager inventory powers */
const ACCOUNTANT = {
  canAccessAdminWorkspace: true,
  canViewReports: true,
  canViewShiftReports: true,
  canApproveShift: true,
  canApprovePurchasing: false,
  canApprovePurchasingAccountant: true,
  canViewPurchaseApprovals: true,
  canViewApprovalsDashboard: true,
  canAccessAccountantWorkspace: true,
  canViewSupplierPayments: true,
  canManageSupplierPayments: true,
  canAccessInvoiceMatching: true,
  canAccessPurchasing: false,
  canViewInvoices: true,
  canViewPOS: false,
  canOperatePOS: false,
  canOpenShift: false,
  canCloseShift: false,
  canAccessInventory: false,
  canInventoryTransfer: false,
  canInventoryReconcile: false,
  canInventoryOperate: false,
  roleLabel: 'Accountant',
  operationalPersona: 'accountant',
};

const STORE_MANAGER = inv({
  canAccessAdminWorkspace: true,
  canViewReports: true,
  canViewAnalytics: true,
  canMonitorCashiers: true,
  canViewReturns: true,
  canCreateReturns: true,
  canApproveReturns: true,
  canApproveReconciliation: true,
  canApprovePurchasing: true,
  canViewPurchaseApprovals: true,
  canViewApprovalsDashboard: true,
  canViewPOS: true,
  canOperatePOS: false,
  canOpenShift: false,
  canCloseShift: false,
  canApproveShift: true,
  canViewShiftReports: true,
  canViewInvoices: true,
  canAccessPurchasing: true,
  canViewSuppliers: true,
  canAccessInventory: true,
  canInventoryOperate: true,
  canInventoryReceipt: true,
  canInventoryTransfer: true,
  canInventoryReconcile: true,
  canInventoryAnalytics: true,
  canInventoryValuation: true,
  canInventoryManage: true,
  roleLabel: 'Store Manager',
  operationalPersona: 'store_manager',
});

/** @type {Record<string, Partial<Capabilities>>} */
export const CAPS_BY_ROLE_PROFILE = {
  [OPERATIONAL_USER_TEMPLATES.cashier.roleProfileName]: CASHIER,
  [OPERATIONAL_USER_TEMPLATES.inventory_clerk.roleProfileName]: INVENTORY_CLERK,
  [OPERATIONAL_USER_TEMPLATES.purchasing_officer.roleProfileName]: PURCHASING_OFFICER,
  [OPERATIONAL_USER_TEMPLATES.store_manager.roleProfileName]: STORE_MANAGER,
  [OPERATIONAL_USER_TEMPLATES.accountant.roleProfileName]: ACCOUNTANT,
  'Elmahdi Accountant': ACCOUNTANT,
  Accountant: ACCOUNTANT,
  'Accounts Manager': ACCOUNTANT,
};
