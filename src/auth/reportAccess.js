/**
 * Report-level authorization matrix.
 *
 * Independent of workspace access. A user with `canViewReports` (e.g. store
 * manager) can SEE /manager/reports, but only sees the reports their role
 * actually owns — never the AR ledger, never P&L. An accountant gets the
 * financial reports but not pure inventory ones.
 *
 * Single source of truth — consumed by:
 *   - src/auth/routeAccess.js          (direct URL / canAccessPath gate)
 *   - src/App.jsx                       (<CapabilityRoute anyOf=...>)
 *   - src/modules/admin/ReportsPage.jsx (launcher card filter)
 *   - scripts/run_route_access_verification.mjs (regression tests)
 *
 * Add a new report by adding an entry here + a backend builder in
 * elmahdi/api/reports.py. The launcher, the routes, the URL gate, and the
 * verification suite all pick it up automatically.
 */

import { hasCapability } from './capabilities';

/**
 * The 6 embedded reports we ship today. Keys MUST match REPORT_NAMES in
 * src/services/reports/index.js and REPORT_REGISTRY in elmahdi/api/reports.py.
 *
 * `anyOf` — user needs at least one of these capabilities. `canManageSystem`
 * (administrator break-glass) is included in every entry so admins always
 * have access.
 *
 * Operational-role intent:
 *   - Store Manager  (canAccessManagerWorkspace): operational reports —
 *                    sales, cash, stock, items. NOT financial (AR / P&L).
 *   - Accountant     (canAccessAccountantWorkspace): financial reports —
 *                    sales, cash, AR ledger, P&L, items. NOT pure stock.
 *   - Inventory Clerk (canAccessInventory): stock balance only.
 *   - Administrator  (canManageSystem): everything.
 */
export const REPORT_ACCESS = Object.freeze({
  'sales-register': {
    label: 'Sales Summary',
    description: 'Per-invoice sales over a date range.',
    icon: '📊',
    path: 'sales-register',
    anyOf: [
      'canAccessManagerWorkspace',
      'canAccessAccountantWorkspace',
      'canManageSystem',
    ],
  },
  'daily-cash-register': {
    label: 'Daily Cash Summary',
    description: 'Per-shift cash reconciliation with variance.',
    icon: '💳',
    path: 'daily-cash',
    anyOf: [
      'canAccessManagerWorkspace',
      'canAccessAccountantWorkspace',
      'canManageSystem',
    ],
  },
  'stock-balance': {
    label: 'Stock Balance',
    description: 'Real-time on-hand quantity and valuation per item × warehouse.',
    icon: '📦',
    path: 'stock-balance',
    anyOf: [
      'canAccessManagerWorkspace',
      'canAccessInventory',
      'canManageSystem',
    ],
  },
  'customer-ledger': {
    label: 'Customer Balance History',
    description: 'Per-customer billed / paid / outstanding over a date range.',
    icon: '👥',
    path: 'customer-ledger',
    anyOf: [
      'canAccessAccountantWorkspace',
      'canManageSystem',
    ],
  },
  'profit-and-loss': {
    label: 'Profit and Loss Statement',
    description: 'Income, expense, and net profit by account.',
    icon: '💹',
    path: 'profit-and-loss',
    anyOf: [
      'canAccessAccountantWorkspace',
      'canManageSystem',
    ],
  },
  'item-wise-sales': {
    label: 'Item-wise Sales History',
    description: 'Top-selling items ranked by revenue.',
    icon: '🏆',
    path: 'item-wise-sales',
    anyOf: [
      'canAccessManagerWorkspace',
      'canAccessAccountantWorkspace',
      'canManageSystem',
    ],
  },
});

/**
 * Every report path slug (the URL segment under `/<workspace>/reports/`).
 * Used by routeAccess.js to build path-gate rules.
 */
export const REPORT_PATH_SLUGS = Object.freeze(
  Object.values(REPORT_ACCESS).map((r) => r.path),
);

/**
 * The workspace URL prefixes where reports live. Adding a new workspace
 * means adding it here AND mounting the routes in App.jsx — the access
 * matrix above is workspace-independent and shared across all of them.
 */
export const REPORT_WORKSPACE_BASES = Object.freeze([
  '/admin/reports',
  '/manager/reports',
  '/finance/reports',
]);

/**
 * Does the user have access to one specific report?
 * @param {string} reportKey — entry in REPORT_ACCESS (e.g. 'sales-register')
 * @param {import('./capabilities').Capabilities} capabilities
 * @returns {boolean}
 */
export function canAccessReport(reportKey, capabilities) {
  const entry = REPORT_ACCESS[reportKey];
  if (!entry) return false;
  return entry.anyOf.some((cap) => hasCapability(capabilities, cap));
}

/**
 * Return the anyOf list for a report — used by <CapabilityRoute>.
 * @param {string} reportKey
 * @returns {string[]}
 */
export function getReportRouteAnyOf(reportKey) {
  return REPORT_ACCESS[reportKey]?.anyOf || ['canManageSystem'];
}

/**
 * List the report entries this user can access. Order is preserved from
 * the matrix so the launcher is deterministic.
 * @param {import('./capabilities').Capabilities} capabilities
 * @returns {Array<{key, label, description, icon, path, anyOf}>}
 */
export function getAccessibleReports(capabilities) {
  return Object.entries(REPORT_ACCESS)
    .filter(([key]) => canAccessReport(key, capabilities))
    .map(([key, def]) => ({ key, ...def }));
}

/**
 * Build the routeAccess.js prefix rules for every workspace × report. Used
 * by routeAccess.js to splice into ROUTE_ACCESS so direct URL access is
 * gated the same way as React routes.
 * @returns {Array<{prefix: string, anyOf: string[]}>}
 */
export function buildReportPathRules() {
  const rules = [];
  for (const base of REPORT_WORKSPACE_BASES) {
    for (const [key, def] of Object.entries(REPORT_ACCESS)) {
      rules.push({ prefix: `${base}/${def.path}`, anyOf: def.anyOf });
    }
  }
  return rules;
}
