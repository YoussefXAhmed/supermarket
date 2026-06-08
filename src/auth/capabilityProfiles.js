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
  canViewOwnShiftHistory: true,
  canViewInvoices: true,
  canViewReturns: true,
  canCreateReturns: true,
  canApproveReturns: false,
  // Self-service: every employee can request leave + see their own payslip.
  canRequestLeave: true,
  canViewPayslipSelf: true,
  roleLabel: 'Cashier',
  operationalPersona: 'cashier',
});

const INVENTORY_CLERK = inv({
  canAccessInventory: true,
  canInventoryOperate: true,
  canInventoryReceipt: true,
  canInventoryTransfer: true,
  canViewSuppliers: true,
  canRequestLeave: true,
  canViewPayslipSelf: true,
  roleLabel: 'Inventory Clerk',
  operationalPersona: 'inventory',
});

const PURCHASING_OFFICER = {
  canAccessPurchasing: true,
  canViewSuppliers: true,
  canViewPurchasingHistory: true,
  canApprovePurchasing: false,
  canApprovePurchasingAccountant: false,
  canViewPurchaseApprovals: false,
  canViewApprovalsDashboard: false,
  canRequestLeave: true,
  canViewPayslipSelf: true,
  roleLabel: 'Purchasing Officer',
  operationalPersona: 'purchasing',
};

/** Future-safe: accountant reviews shift closings without full store manager inventory powers */
const ACCOUNTANT = {
  // Phase 4.a — Accountant reads batch-audit history for compliance.
  canViewBatchAudit: true,
  canSetUserPasswordDirectly: false,
  canAccessAccountantWorkspace: true,
  canViewStockLedgerReadOnly: true,
  canViewReports: true,
  canViewShiftReports: true,
  canApproveShift: true,
  canApprovePurchasing: false,
  canApprovePurchasingAccountant: false,
  canViewPurchasingHistory: true,
  canViewPurchaseApprovals: false,
  canViewApprovalsDashboard: true,
  canViewSupplierPayments: true,
  canManageSupplierPayments: true,
  canViewSuppliers: true,
  canAccessInvoiceMatching: true,
  canAccessPurchasing: false,
  canViewInvoices: true,
  canViewPOS: false,
  canOperatePOS: false,
  canOpenShift: false,
  canCloseShift: false,
  canAccessInventory: false,
  canAccessAdminWorkspace: false,
  canInventoryTransfer: false,
  canInventoryReconcile: false,
  canInventoryOperate: false,
  canRequestLeave: true,
  canViewPayslipSelf: true,
  // Phase 4 — Accountant owns finance policy (aging buckets, AP scan).
  canManageFinanceSettings: true,
  roleLabel: 'Accountant',
  operationalPersona: 'accountant',
};

/** Monitor / approve only — no POS, returns, invoices, or execution modules. */
const STORE_MANAGER = inv({
  // Phase 4.a — Store Manager may read batch audit history and dispatch
  // password-reset links for users they manage (own-branch scoping is
  // enforced at the call-site). They MUST NOT set passwords directly.
  canViewBatchAudit: true,
  canSendPasswordResetLink: true,
  canSetUserPasswordDirectly: false,
  canAccessManagerWorkspace: true,
  canViewReports: true,
  canViewAnalytics: true,
  canMonitorCashiers: true,
  canApproveReturns: true,
  canApproveReconciliation: true,
  canApprovePurchasing: true,
  canViewPurchaseApprovals: true,
  canViewPurchasingHistory: true,
  canViewSuppliers: true,
  canManagePOSProfiles: true,
  canViewApprovalsDashboard: true,
  // Read-only General Ledger: managers see their branch's financial impact
  // (margin, COGS, cash position) but cannot edit any accounting entry.
  canViewGLReadOnly: true,
  // HR — Store Manager approves leave for own branch + sees own-branch
  // HR reports + can view own payslip. Everything else is HR / Admin.
  canApproveLeave: true,
  canViewHRReports: true,
  canRequestLeave: true,
  canViewPayslipSelf: true,
  // Phase 4 — workspace settings: Store Manager owns store policy.
  canManageInventorySettings: true,
  canManagePurchasingSettings: true,
  canViewPOS: false,
  canOperatePOS: false,
  canOpenShift: false,
  canCloseShift: false,
  canApproveShift: false,
  canViewShiftReports: true,
  canViewInvoices: false,
  canViewReturns: false,
  canCreateReturns: false,
  canAccessPurchasing: false,
  canAccessAdminWorkspace: false,
  // canViewSuppliers is intentionally granted above (true). The earlier
  // "monitor only" profile set this to false here — kept commented as a
  // landmark since last-wins JS-object semantics make duplicate keys silent.
  canAccessInvoiceMatching: false,
  // Store Manager intentionally has NO inventory / warehouse visibility.
  // They manage suppliers, approvals, shifts, reports, and POS profiles only —
  // warehouse-level operations belong to Inventory Clerks.
  canAccessInventory: false,
  canInventoryOperate: false,
  canInventoryReceipt: false,
  canInventoryTransfer: false,
  canInventoryReconcile: false,
  canInventoryAnalytics: false,
  canInventoryValuation: false,
  canInventoryManage: false,
  roleLabel: 'Store Manager',
  operationalPersona: 'store_manager',
});

/** System administrator — governance only (no POS / inventory / purchasing execution). */
const ADMINISTRATOR = {
  canManageSystem: true,
  canManageUsers: true,
  canManageSettings: true,
  canManageOperationalUsers: true,
  // Phase 4.a — Admin is the only role permitted to set a user password
  // directly (break-glass). Reset links go through the secure token
  // flow used by Store Manager + HR.
  canViewBatchAudit: true,
  canSendPasswordResetLink: true,
  canSetUserPasswordDirectly: true,
  canManagePOSProfiles: true,
  canAccessAdminWorkspace: true,
  canViewReports: true,
  canViewAnalytics: true,
  canViewApprovalsDashboard: true,
  canViewEmployees: true,
  // Phase 4 — Admin has every workspace settings cap.
  canManageInventorySettings: true,
  canManagePurchasingSettings: true,
  canManageFinanceSettings: true,
  canManageHRSettings: true,
  // Full HR cap set for Admin so they can audit / fix any HR state.
  canManageEmployees: true,
  canManageAttendance: true,
  canApproveLeave: true,
  canRequestLeave: true,
  canManagePayroll: true,
  canViewHRReports: true,
  canViewPayslipSelf: true,
  canViewPOS: false,
  canOperatePOS: false,
  canOpenShift: false,
  canCloseShift: false,
  canApproveShift: false,
  canViewShiftReports: false,
  canViewInvoices: false,
  canViewReturns: false,
  canCreateReturns: false,
  canAccessPurchasing: false,
  canViewSuppliers: false,
  canAccessAccountantWorkspace: false,
  canAccessInvoiceMatching: false,
  canViewSupplierPayments: false,
  canManageSupplierPayments: false,
  canApprovePurchasing: false,
  canApprovePurchasingAccountant: false,
  canViewPurchaseApprovals: false,
  canAccessInventory: false,
  roleLabel: 'Administrator',
  operationalPersona: 'administrator',
};

/** HR — workforce records + operational user provisioning (no finance/inventory/security). */
const HR_OFFICER = {
  // Phase 4.a — HR may dispatch password-reset links (own branch). Never
  // sets passwords directly.
  canViewBatchAudit: true,
  canSendPasswordResetLink: true,
  canSetUserPasswordDirectly: false,
  canAccessHRWorkspace: true,
  canManageEmployees: true,
  canViewEmployees: true,
  canManageOperationalUsers: true,
  canManageUsers: true,
  // HR module caps (Batch A foundation — backend asserters mirror these).
  canManageAttendance: true,
  canApproveLeave: true,
  canRequestLeave: true,
  canManagePayroll: true,
  canViewHRReports: true,
  canViewPayslipSelf: true,
  // Phase 4 — HR Officer owns HR Settings (standard working hours,
  // leave notification flag, employee naming).
  canManageHRSettings: true,
  canAccessAdminWorkspace: false,
  canManageSystem: false,
  canManageSettings: false,
  roleLabel: 'HR Officer',
  operationalPersona: 'hr',
};

/** @type {Record<string, Partial<Capabilities>>} */
export const CAPS_BY_ROLE_PROFILE = {
  'Elmahdi Administrator': ADMINISTRATOR,
  [OPERATIONAL_USER_TEMPLATES.cashier.roleProfileName]: CASHIER,
  [OPERATIONAL_USER_TEMPLATES.inventory_clerk.roleProfileName]: INVENTORY_CLERK,
  [OPERATIONAL_USER_TEMPLATES.purchasing_officer.roleProfileName]: PURCHASING_OFFICER,
  [OPERATIONAL_USER_TEMPLATES.store_manager.roleProfileName]: STORE_MANAGER,
  [OPERATIONAL_USER_TEMPLATES.accountant.roleProfileName]: ACCOUNTANT,
  [OPERATIONAL_USER_TEMPLATES.hr_officer.roleProfileName]: HR_OFFICER,
  'Elmahdi Accountant': ACCOUNTANT,
  Accountant: ACCOUNTANT,
  'Accounts Manager': ACCOUNTANT,
};
