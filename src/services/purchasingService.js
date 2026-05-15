import {
  listSuppliers,
  listPurchaseInvoices,
  listPurchaseReceipts,
  listPurchaseInvoiceItemReceiptLinks,
} from './purchasingApi';
import {
  safeResourceList,
  buildReceiptToInvoicesMap,
  isReceiptFullyBilled,
  billingStatusLabel,
} from './purchasingQueryUtils';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapReceiptToMatchingRow(receipt, invoiceMap) {
  const invoices = invoiceMap.has(receipt.name)
    ? [...invoiceMap.get(receipt.name)]
    : [];
  const billed = isReceiptFullyBilled(receipt.per_billed);
  const linked = billed || invoices.length > 0;

  return {
    receipt: receipt.name,
    supplier: receipt.supplier,
    posting_date: receipt.posting_date,
    grand_total: receipt.grand_total,
    per_billed: toNum(receipt.per_billed),
    billing_status: billingStatusLabel(receipt.per_billed),
    purchase_invoices: invoices,
    purchase_invoice: invoices[0] || '',
    linked,
  };
}

export async function getSupplierBalanceOverview(supplierName) {
  const warnings = [];
  const { data: invoices } = await safeResourceList(
    () =>
      listPurchaseInvoices({
        limit: 500,
        filters: [
          ['supplier', '=', supplierName],
          ['docstatus', '=', 1],
          ['outstanding_amount', '>', 0],
        ],
      }),
    'open purchase invoices',
    warnings
  );
  const outstanding = invoices.reduce((s, i) => s + toNum(i.outstanding_amount), 0);
  const totalPurchased = invoices.reduce((s, i) => s + toNum(i.grand_total), 0);

  const { data: receipts } = await safeResourceList(
    () =>
      listPurchaseReceipts({
        limit: 200,
        filters: [['supplier', '=', supplierName], ['docstatus', '=', 1]],
      }),
    'purchase receipts',
    warnings
  );

  return {
    outstanding,
    totalPurchased,
    openInvoices: invoices.length,
    receiptCount: receipts.length,
    recentInvoices: invoices.slice(0, 5),
    recentReceipts: receipts.slice(0, 5),
    warnings,
  };
}

export async function getPurchasingAnalytics() {
  const warnings = [];

  const { data: suppliers } = await safeResourceList(
    () => listSuppliers({ limit: 500 }),
    'suppliers',
    warnings
  );
  const { data: invoices } = await safeResourceList(
    () => listPurchaseInvoices({ limit: 500, filters: [['docstatus', '=', 1]] }),
    'purchase invoices',
    warnings
  );
  const { data: receipts } = await safeResourceList(
    () => listPurchaseReceipts({ limit: 500, filters: [['docstatus', '=', 1]] }),
    'purchase receipts',
    warnings
  );

  const totalPurchases = invoices.reduce((s, i) => s + toNum(i.grand_total), 0);
  const totalOutstanding = invoices.reduce((s, i) => s + toNum(i.outstanding_amount), 0);

  const bySupplier = new Map();
  for (const inv of invoices) {
    const key = inv.supplier || 'Unknown';
    if (!bySupplier.has(key)) {
      bySupplier.set(key, { supplier: key, total: 0, count: 0, outstanding: 0 });
    }
    const row = bySupplier.get(key);
    row.total += toNum(inv.grand_total);
    row.outstanding += toNum(inv.outstanding_amount);
    row.count += 1;
  }

  const frequentSuppliers = [...bySupplier.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStr = monthStart.toISOString().slice(0, 10);
  const monthPurchases = invoices
    .filter((i) => (i.posting_date || '') >= monthStr)
    .reduce((s, i) => s + toNum(i.grand_total), 0);

  return {
    supplierCount: suppliers.length,
    invoiceCount: invoices.length,
    receiptCount: receipts.length,
    totalPurchases,
    totalOutstanding,
    monthPurchases,
    frequentSuppliers,
    warnings,
  };
}

export async function getPurchaseHistoryReport({ supplier, fromDate, limit = 300 } = {}) {
  const warnings = [];
  const filters = [['docstatus', '!=', 2]];
  if (supplier) filters.push(['supplier', '=', supplier]);
  if (fromDate) filters.push(['posting_date', '>=', fromDate]);

  const { data: invoiceRows } = await safeResourceList(
    () => listPurchaseInvoices({ limit, filters }),
    'purchase invoices',
    warnings
  );
  const { data: receiptRows } = await safeResourceList(
    () => listPurchaseReceipts({ limit, filters }),
    'purchase receipts',
    warnings
  );

  const invoices = invoiceRows.map((r) => ({ ...r, doc_type: 'Purchase Invoice' }));
  const receipts = receiptRows.map((r) => ({
    ...r,
    doc_type: 'Purchase Receipt',
    outstanding_amount: 0,
  }));

  const combined = [...invoices, ...receipts].sort((a, b) =>
    String(b.posting_date).localeCompare(String(a.posting_date))
  );

  const costByMonth = new Map();
  for (const row of invoices) {
    const key = (row.posting_date || '').slice(0, 7);
    if (!key) continue;
    costByMonth.set(key, (costByMonth.get(key) || 0) + toNum(row.grand_total));
  }

  return {
    rows: combined,
    costTrend: [...costByMonth.entries()]
      .map(([month, value]) => ({ month, value }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    warnings,
  };
}

export async function getInvoiceMatchingRows({ limit = 150 } = {}) {
  const warnings = [];

  const { data: receipts } = await safeResourceList(
    () =>
      listPurchaseReceipts({
        limit,
        filters: [['docstatus', '=', 1]],
      }),
    'purchase receipts',
    warnings
  );

  const { data: piItemLinks } = await safeResourceList(
    () => listPurchaseInvoiceItemReceiptLinks({ limit: 1000 }),
    'purchase invoice item links',
    warnings
  );

  const invoiceMap = buildReceiptToInvoicesMap(piItemLinks);
  const rows = receipts.map((r) => mapReceiptToMatchingRow(r, invoiceMap));

  return { rows, warnings };
}
