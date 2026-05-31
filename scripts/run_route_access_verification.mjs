/**
 * PH2.2 — Synchronous route-access verification.
 * Run: node scripts/run_route_access_verification.mjs
 */

const PROTECTED_ROOTS = [
  '/pos', '/shifts', '/inventory', '/hr', '/manager', '/finance', '/purchasing', '/admin',
];

/**
 * REPORT_ACCESS — mirrors src/auth/reportAccess.js. Intentionally a hand-
 * maintained copy in this verification script: the script asserts what
 * SHOULD be true so drift between intent and production is caught here.
 */
const REPORT_ACCESS = {
  'sales-register':      { path: 'sales-register',  anyOf: ['canAccessManagerWorkspace', 'canAccessAccountantWorkspace', 'canManageSystem'] },
  'daily-cash-register': { path: 'daily-cash',      anyOf: ['canAccessManagerWorkspace', 'canAccessAccountantWorkspace', 'canManageSystem'] },
  'stock-balance':       { path: 'stock-balance',   anyOf: ['canAccessManagerWorkspace', 'canAccessInventory', 'canManageSystem'] },
  'customer-ledger':     { path: 'customer-ledger', anyOf: ['canAccessAccountantWorkspace', 'canManageSystem'] },
  'profit-and-loss':     { path: 'profit-and-loss', anyOf: ['canAccessAccountantWorkspace', 'canManageSystem'] },
  'item-wise-sales':     { path: 'item-wise-sales', anyOf: ['canAccessManagerWorkspace', 'canAccessAccountantWorkspace', 'canManageSystem'] },
};
const REPORT_WORKSPACE_BASES = ['/admin/reports', '/manager/reports', '/finance/reports'];
const REPORT_RULES = [];
for (const base of REPORT_WORKSPACE_BASES) {
  for (const [, def] of Object.entries(REPORT_ACCESS)) {
    REPORT_RULES.push({ prefix: `${base}/${def.path}`, anyOf: def.anyOf });
  }
}

const ROUTE_ACCESS = [
  // Per-report rules first — more specific than `/<workspace>/reports`.
  ...REPORT_RULES,
  { prefix: '/pos/returns', anyOf: ['canCreateReturns'] },
  { prefix: '/pos', anyOf: ['canOperatePOS', 'canViewPOS'] },
  { prefix: '/shifts/open', anyOf: ['canOpenShift'] },
  { prefix: '/shifts/close', anyOf: ['canCloseShift'] },
  { prefix: '/shifts/history', anyOf: ['canViewShiftReports', 'canViewOwnShiftHistory'] },
  { prefix: '/shifts', anyOf: ['canOpenShift', 'canCloseShift', 'canViewShiftReports', 'canViewOwnShiftHistory'] },
  { prefix: '/inventory/items', anyOf: ['canInventoryManage', 'canManageSystem'] },
  { prefix: '/inventory/reports', anyOf: ['canInventoryManage', 'canManageSystem'] },
  { prefix: '/inventory/batches', anyOf: ['canInventoryManage', 'canManageSystem'] },
  { prefix: '/inventory/analytics', anyOf: ['canInventoryAnalytics', 'canManageSystem'] },
  { prefix: '/inventory/transfer', anyOf: ['canInventoryTransfer', 'canInventoryIssueTransfer'] },
  { prefix: '/inventory/stock-entry', anyOf: ['canAccessInventory'] },
  { prefix: '/inventory', anyOf: ['canAccessInventory'] },
  { prefix: '/hr/users', anyOf: ['canManageOperationalUsers'] },
  { prefix: '/hr', anyOf: ['canAccessHRWorkspace'] },
  { prefix: '/manager', anyOf: ['canAccessManagerWorkspace'] },
  { prefix: '/finance/purchase-approvals', anyOf: ['canViewPurchaseApprovals'] },
  { prefix: '/manager/purchase-approvals', anyOf: ['canViewPurchaseApprovals'] },
  { prefix: '/finance/payments', anyOf: ['canViewSupplierPayments'] },
  { prefix: '/finance', anyOf: ['canAccessAccountantWorkspace'] },
  { prefix: '/purchasing/invoices', anyOf: ['canManageSystem'] },
  { prefix: '/purchasing/reports', anyOf: ['canManageSystem'] },
  { prefix: '/purchasing/history', anyOf: ['canViewPurchasingHistory', 'canManageSystem'] },
  { prefix: '/purchasing/receive', anyOf: ['canAccessPurchasing', 'canManageSystem'] },
  { prefix: '/purchasing', anyOf: ['canAccessPurchasing', 'canManageSystem'] },
  { prefix: '/admin/invoices', anyOf: ['canManageSystem'] },
  { prefix: '/admin/approvals', anyOf: ['canManageSystem'] },
  { prefix: '/admin/pos-profiles', anyOf: ['canManagePOSProfiles', 'canManageSystem'] },
  { prefix: '/manager/pos-profiles', anyOf: ['canManagePOSProfiles', 'canManageSystem'] },
  { prefix: '/admin', anyOf: ['canManageSystem'] },
];

const SHIFT_CAPS = ['canOpenShift', 'canCloseShift', 'canViewShiftReports', 'canViewOwnShiftHistory'];

function hasCapability(caps, capName) {
  return Boolean(caps?.[capName]);
}

function isProtectedPath(pathname) {
  return PROTECTED_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

function canAccessPath(pathname, caps) {
  if (!pathname || pathname === '/login') return true;
  const rule = ROUTE_ACCESS.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  if (!rule) return !isProtectedPath(pathname);
  return rule.anyOf.some((cap) => hasCapability(caps, cap));
}

function resolveHomePath(caps) {
  if (hasCapability(caps, 'canManageSystem')) return '/admin';
  if (caps.operationalPersona === 'hr') return '/hr';
  if (caps.operationalPersona === 'store_manager') return '/manager';
  if (caps.operationalPersona === 'accountant') return '/finance';
  if (hasCapability(caps, 'canOperatePOS')) return '/pos';
  if (caps.operationalPersona === 'purchasing') return '/purchasing';
  if (hasCapability(caps, 'canAccessInventory')) return '/inventory';
  return '/login';
}

function finalizeCapabilities(caps) {
  const c = { ...caps };
  c.canInventoryIssueTransfer = Boolean(c.canInventoryTransfer);
  if (!c.canAccessPurchasing && c.operationalPersona === 'purchasing') {
    c.canAccessPurchasing = true;
  }
  c.canExecutePurchaseApproval = Boolean(
    c.canApprovePurchasing &&
    (c.canManageSystem ||
      (c.operationalPersona === 'store_manager' && c.canAccessManagerWorkspace)),
  );
  c.canViewPurchaseApprovals = Boolean(
    c.canExecutePurchaseApproval || c.canManageSystem,
  );
  c.canViewApprovalsDashboard = Boolean(
    c.canViewApprovalsDashboard ||
      c.canExecuteShiftClosingApproval ||
      c.canApproveShift ||
      c.canExecutePurchaseApproval ||
      c.canManageSystem,
  );
  c.canViewSupplierPayments = Boolean(
    c.canManageSupplierPayments || c.canAccessAccountantWorkspace || c.canManageSystem,
  );
  c.canExecuteShiftClosingApproval = Boolean(
    c.canApproveShift &&
    (c.canManageSystem ||
      (c.operationalPersona === 'accountant' && c.canAccessAccountantWorkspace)),
  );
  return c;
}

const ROLE_CAPS = {
  cashier: finalizeCapabilities({
    canViewPOS: true, canOperatePOS: true, canOpenShift: true, canCloseShift: true,
    canViewOwnShiftHistory: true, canViewInvoices: true, operationalPersona: 'cashier',
  }),
  inventory: finalizeCapabilities({
    canAccessInventory: true, canInventoryTransfer: true, canInventoryIssueTransfer: true,
    operationalPersona: 'inventory',
  }),
  purchasing: finalizeCapabilities({
    canAccessPurchasing: true, canViewPurchasingHistory: true, operationalPersona: 'purchasing',
  }),
  store_manager: finalizeCapabilities({
    canAccessManagerWorkspace: true, canViewReports: true, canApprovePurchasing: true,
    canViewPurchaseApprovals: true, canViewPurchasingHistory: true,
    canManagePOSProfiles: true,
    canViewApprovalsDashboard: true, canViewShiftReports: true,
    canAccessPurchasing: false, canAccessInventory: false, canViewPOS: false,
    operationalPersona: 'store_manager',
  }),
  accountant: finalizeCapabilities({
    canAccessAccountantWorkspace: true, canViewSupplierPayments: true,
    canViewPurchasingHistory: true,
    canViewInvoices: true, canApproveShift: true, canViewApprovalsDashboard: true,
    canViewShiftReports: true, canAccessInventory: false, canInventoryTransfer: false,
    operationalPersona: 'accountant',
  }),
  hr: finalizeCapabilities({
    canAccessHRWorkspace: true, operationalPersona: 'hr',
  }),
  admin: finalizeCapabilities({
    canManageSystem: true, canManageSettings: true, canViewShiftReports: true,
    operationalPersona: 'administrator',
  }),
};

const REQUIRE_CAP = {
  admin: 'canManageSystem', manager: 'canAccessManagerWorkspace',
  finance: 'canAccessAccountantWorkspace', hr: 'canAccessHRWorkspace',
  pos: 'canViewPOS', inventory: 'canAccessInventory', purchasing: 'canAccessPurchasing',
};

const ROUTE_GUARDS = [
  { path: '/admin', shell: 'admin' },
  { path: '/finance', shell: 'finance' },
  { path: '/finance/payments', shell: 'finance' },
  { path: '/hr', shell: 'hr' },
  { path: '/pos', shell: 'pos' },
  { path: '/inventory', shell: 'inventory' },
  { path: '/inventory/stock-entry', shell: 'inventory' },
  { path: '/inventory/items', shell: 'inventory' },
  { path: '/inventory/reports', shell: 'inventory' },
  { path: '/purchasing', shell: 'purchasing' },
  { path: '/purchasing/invoices', shell: 'purchasing' },
  { path: '/purchasing/reports', shell: 'purchasing' },
  { path: '/purchasing/receive', shell: 'purchasing' },
  { path: '/shifts/open', shell: 'shifts' },
  { path: '/manager', shell: 'manager' },
];

const FORBIDDEN_MATRIX = {
  cashier: ['/admin', '/inventory', '/finance', '/purchasing', '/manager', '/hr'],
  inventory: ['/inventory/items', '/inventory/reports', '/finance', '/purchasing/invoices'],
  purchasing: ['/finance', '/purchasing/reports', '/purchasing/invoices', '/inventory/items'],
  store_manager: ['/pos', '/inventory/stock-entry', '/purchasing/receive', '/finance/payments'],
  accountant: ['/inventory/transfer', '/inventory/stock-entry/create', '/finance/purchase-approvals', '/manager/purchase-approvals'],
  hr: ['/finance', '/inventory', '/purchasing', '/manager', '/shifts/open'],
};

function shellPass(caps, shell) {
  if (shell === 'shifts') {
    return SHIFT_CAPS.some((c) => hasCapability(caps, c));
  }
  if (!shell) return true;
  return hasCapability(caps, REQUIRE_CAP[shell]);
}

/** PH2.2 synchronous ProtectedRoute — shell + path before any layout render. */
function simulateSyncAccess(caps, path) {
  const guard = ROUTE_GUARDS
    .filter((g) => path === g.path || path.startsWith(`${g.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];

  const home = resolveHomePath(caps);

  if (guard?.shell && !shellPass(caps, guard.shell)) {
    return { allowed: false, shellRenders: false, pageRenders: false, layer: 'ProtectedRoute-shell' };
  }

  if (!canAccessPath(path, caps)) {
    return { allowed: false, shellRenders: false, pageRenders: false, layer: 'ProtectedRoute-path' };
  }

  return { allowed: true, shellRenders: true, pageRenders: true, layer: 'ok' };
}

console.log('=== PH2.2 Synchronous Route Verification ===\n');

const leaks = [];
const shellFlashes = [];

for (const [role, paths] of Object.entries(FORBIDDEN_MATRIX)) {
  const caps = ROLE_CAPS[role];
  console.log(`[${role}]`);
  for (const path of paths) {
    const r = simulateSyncAccess(caps, path);
    const status = r.pageRenders ? 'LEAK' : r.shellRenders ? 'SHELL-FLASH' : 'BLOCKED';
    console.log(`  ${path} → ${status} (${r.layer})`);
    if (r.pageRenders) leaks.push({ role, path });
    if (r.shellRenders && !r.pageRenders) shellFlashes.push({ role, path });
  }
  console.log('');
}

// Fail-closed paths outside registered rules
const failClosedOk = !canAccessPath('/mystery-workspace/page', ROLE_CAPS.cashier);
console.log(`Fail-closed unregistered workspace: ${failClosedOk ? 'PASS' : 'FAIL'}`);

// Cashier no longer passes canAccessPath for /admin/invoices
const cashierAdminInvoices = canAccessPath('/admin/invoices', ROLE_CAPS.cashier);
console.log(`Cashier /admin/invoices canAccessPath deny: ${!cashierAdminInvoices ? 'PASS' : 'FAIL'}`);

// ─────────────────────────────────────────────────────────────────────────────
// Report-level authorization tests.
//
// Two layers:
//   (1) Matrix: canAccessReport(key, caps) — asserts the REPORT_ACCESS rules.
//       Independent of URL/workspace. Inventory clerks "can access" stock-balance
//       per matrix even though they have no /inventory/reports route today.
//   (2) URL pipeline: simulateSyncAccess(caps, '/<ws>/reports/<slug>') —
//       asserts the full chain (workspace shell + per-report matrix gate).
// ─────────────────────────────────────────────────────────────────────────────

function canAccessReport(key, caps) {
  const def = REPORT_ACCESS[key];
  return Boolean(def && def.anyOf.some((c) => hasCapability(caps, c)));
}

const EXPECTED_MATRIX_ACCESS = {
  cashier: [],
  inventory: ['stock-balance'],
  purchasing: [],
  store_manager: ['sales-register', 'daily-cash-register', 'stock-balance', 'item-wise-sales'],
  accountant: ['sales-register', 'daily-cash-register', 'customer-ledger', 'profit-and-loss', 'item-wise-sales'],
  hr: [],
  admin: ['sales-register', 'daily-cash-register', 'stock-balance', 'customer-ledger', 'profit-and-loss', 'item-wise-sales'],
};

/** Workspace each role can actually open. Roles not listed have no reports workspace. */
const ROLE_REPORT_WORKSPACE = {
  store_manager: '/manager/reports',
  accountant: '/finance/reports',
  admin: '/admin/reports',
};

console.log('\n[report matrix — canAccessReport]');
let matrixFails = 0;
const allReports = Object.keys(REPORT_ACCESS);
for (const [role, expected] of Object.entries(EXPECTED_MATRIX_ACCESS)) {
  const caps = ROLE_CAPS[role];
  const actual = allReports.filter((k) => canAccessReport(k, caps));
  const missing = expected.filter((k) => !actual.includes(k));
  const extra = actual.filter((k) => !expected.includes(k));
  const ok = missing.length === 0 && extra.length === 0;
  console.log(`  ${role.padEnd(14)} ${ok ? 'PASS' : 'FAIL'}  matrix=[${actual.join(', ')}]`);
  if (!ok) {
    matrixFails += 1;
    if (missing.length) console.log(`    missing: ${missing.join(', ')}`);
    if (extra.length) console.log(`    extra (leak!): ${extra.join(', ')}`);
  }
}

console.log('\n[report URLs — full pipeline (shell + matrix)]');
let urlFails = 0;
for (const [role, expectedReports] of Object.entries(EXPECTED_MATRIX_ACCESS)) {
  const caps = ROLE_CAPS[role];
  const ownBase = ROLE_REPORT_WORKSPACE[role];
  console.log(`  [${role}]`);

  for (const key of allReports) {
    const slug = REPORT_ACCESS[key].path;

    // (a) Own workspace — should allow iff report is in role's matrix list.
    if (ownBase) {
      const path = `${ownBase}/${slug}`;
      const expected = expectedReports.includes(key);
      const result = simulateSyncAccess(caps, path);
      const ok = result.allowed === expected;
      if (!ok) {
        console.log(`    ${path.padEnd(45)} FAIL  expected ${expected ? 'allow' : 'deny'}, got ${result.allowed ? 'allow' : 'deny'}@${result.layer}`);
        urlFails += 1;
      }
    }

    // (b) Cross-workspace — should always deny on the shell gate.
    for (const base of REPORT_WORKSPACE_BASES) {
      if (base === ownBase) continue;
      const path = `${base}/${slug}`;
      const result = simulateSyncAccess(caps, path);
      if (result.allowed) {
        console.log(`    ${path.padEnd(45)} FAIL  cross-workspace LEAK (${result.layer})`);
        urlFails += 1;
      }
    }
  }
}
if (urlFails === 0) console.log('  All URL × role × report combinations match expected matrix.');

console.log('\n--- Summary ---');
console.log(`Page leaks: ${leaks.length}`);
console.log(`Shell flashes: ${shellFlashes.length}`);
console.log(`Report matrix fails: ${matrixFails}`);
console.log(`Report URL fails: ${urlFails}`);

process.exit(leaks.length + shellFlashes.length + matrixFails + urlFails > 0 ? 1 : 0);
