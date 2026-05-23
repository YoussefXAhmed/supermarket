/**
 * PH2.2 — Synchronous route-access verification.
 * Run: node scripts/run_route_access_verification.mjs
 */

const PROTECTED_ROOTS = [
  '/pos', '/shifts', '/inventory', '/hr', '/manager', '/finance', '/purchasing', '/admin',
];

const ROUTE_ACCESS = [
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
  { prefix: '/finance/payments', anyOf: ['canViewSupplierPayments'] },
  { prefix: '/finance', anyOf: ['canAccessAccountantWorkspace'] },
  { prefix: '/purchasing/invoices', anyOf: ['canManageSystem'] },
  { prefix: '/purchasing/reports', anyOf: ['canManageSystem'] },
  { prefix: '/purchasing/receive', anyOf: ['canAccessPurchasing', 'canManageSystem'] },
  { prefix: '/purchasing', anyOf: ['canAccessPurchasing', 'canManageSystem'] },
  { prefix: '/admin/invoices', anyOf: ['canManageSystem'] },
  { prefix: '/admin/approvals', anyOf: ['canManageSystem'] },
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
  c.canViewPurchaseApprovals = Boolean(
    c.canApprovePurchasing || c.canApprovePurchasingAccountant || c.canManageSystem,
  );
  c.canViewApprovalsDashboard = Boolean(
    c.canViewApprovalsDashboard || c.canApproveShift || c.canViewPurchaseApprovals || c.canManageSystem,
  );
  c.canViewSupplierPayments = Boolean(
    c.canManageSupplierPayments || c.canAccessAccountantWorkspace || c.canManageSystem,
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
    canAccessPurchasing: true, operationalPersona: 'purchasing',
  }),
  store_manager: finalizeCapabilities({
    canAccessManagerWorkspace: true, canViewReports: true, canApprovePurchasing: true,
    canViewApprovalsDashboard: true, canViewShiftReports: true,
    canAccessPurchasing: false, canAccessInventory: false, canViewPOS: false,
    operationalPersona: 'store_manager',
  }),
  accountant: finalizeCapabilities({
    canAccessAccountantWorkspace: true, canViewSupplierPayments: true,
    canViewInvoices: true, canAccessInventory: false, canInventoryTransfer: false,
    operationalPersona: 'accountant',
  }),
  hr: finalizeCapabilities({
    canAccessHRWorkspace: true, operationalPersona: 'hr',
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
  accountant: ['/inventory/transfer', '/inventory/stock-entry/create'],
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

console.log('\n--- Summary ---');
console.log(`Page leaks: ${leaks.length}`);
console.log(`Shell flashes: ${shellFlashes.length}`);

process.exit(leaks.length + shellFlashes.length > 0 ? 1 : 0);
