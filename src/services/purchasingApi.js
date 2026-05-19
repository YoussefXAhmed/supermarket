import api, { getCompanies } from './api';
import {
  validateReceiveForm,
  validatePurchaseInvoiceForm,
  validateSupplierForm,
} from '../utils/purchasingValidation';
import {
  PURCHASE_RECEIPT_LIST_FIELDS,
  PURCHASE_INVOICE_ITEM_LINK_FIELDS,
} from './purchasingQueryUtils';
import { logActivity, ActivityType } from './activityLogService';

const SUBMIT_RETRIES = 2;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveCompany(explicit) {
  if (explicit) return explicit;
  const res = await getCompanies({ limit: 1 });
  return res?.data?.data?.[0]?.name;
}

async function submitDoc(doctype, name, getDoc) {
  const encoded = encodeURIComponent(doctype);
  let lastErr;
  for (let i = 0; i <= SUBMIT_RETRIES; i += 1) {
    try {
      await api.put(`/api/resource/${encoded}/${encodeURIComponent(name)}`, { docstatus: 1 });
      const doc = await getDoc(name);
      return { name, doc, submitted: true };
    } catch (e) {
      lastErr = e;
      try {
        const check = await getDoc(name);
        if (check?.docstatus === 1) return { name, doc: check, submitted: true };
      } catch {
        /* retry */
      }
      if (i < SUBMIT_RETRIES) await sleep(400);
    }
  }
  const err = lastErr || new Error(`${doctype} submit failed`);
  err.draftName = name;
  throw err;
}

/* ── Suppliers ── */

export const listSuppliers = (params = {}) =>
  api.get('/api/resource/Supplier', {
    params: {
      fields: JSON.stringify([
        'name',
        'supplier_name',
        'supplier_group',
        'supplier_type',
        'country',
        'mobile_no',
        'email_id',
        'website',
        'tax_id',
        'disabled',
      ]),
      filters: JSON.stringify([['disabled', '=', 0]]),
      order_by: 'modified desc',
      limit_page_length: params.limit || 200,
    },
  });

export const getSupplier = (name) =>
  api.get(`/api/resource/Supplier/${encodeURIComponent(name)}`, {
    params: {
      fields: JSON.stringify([
        'name',
        'supplier_name',
        'supplier_group',
        'supplier_type',
        'country',
        'mobile_no',
        'email_id',
        'website',
        'tax_id',
        'payment_terms',
        'supplier_details',
        'disabled',
      ]),
    },
  });

export const createSupplier = (payload) =>
  api.post('/api/resource/Supplier', payload);

export const updateSupplier = (name, payload) =>
  api.put(`/api/resource/Supplier/${encodeURIComponent(name)}`, payload);

export async function saveSupplier({ name, ...fields }) {
  const check = validateSupplierForm(fields);
  if (!check.valid) {
    const err = new Error(check.errors.join(' '));
    err.validationErrors = check.errors;
    throw err;
  }
  const body = {
    supplier_name: fields.supplier_name.trim(),
    supplier_group: fields.supplier_group.trim(),
    supplier_type: fields.supplier_type || 'Company',
    country: fields.country || undefined,
    mobile_no: fields.mobile_no || undefined,
    email_id: fields.email_id || undefined,
    website: fields.website || undefined,
    tax_id: fields.tax_id || undefined,
    payment_terms: fields.payment_terms || undefined,
    supplier_details: fields.supplier_details || undefined,
  };
  if (name) {
    const res = await updateSupplier(name, body);
    return res?.data?.data;
  }
  const res = await createSupplier(body);
  return res?.data?.data;
}

/* ── Purchase Receipt ── */

export const listPurchaseReceipts = (params = {}) =>
  api.get('/api/resource/Purchase Receipt', {
    params: {
      fields: JSON.stringify(PURCHASE_RECEIPT_LIST_FIELDS),
      filters: JSON.stringify(params.filters || [['docstatus', '!=', 2]]),
      order_by: 'posting_date desc',
      limit_page_length: params.limit || 100,
    },
  });

/** Purchase Invoice Item rows that reference a Purchase Receipt (official link). */
export const listPurchaseInvoiceItemReceiptLinks = (params = {}) =>
  api.get('/api/resource/Purchase Invoice Item', {
    params: {
      fields: JSON.stringify(PURCHASE_INVOICE_ITEM_LINK_FIELDS),
      filters: JSON.stringify([
        ['purchase_receipt', '!=', ''],
        ...(params.filters || []),
      ]),
      limit_page_length: params.limit || 500,
    },
  });

export const getPurchaseReceipt = async (name) => {
  const res = await api.get(`/api/resource/Purchase Receipt/${encodeURIComponent(name)}`);
  return res?.data?.data;
};

export const createPurchaseReceipt = (payload) =>
  api.post('/api/resource/Purchase Receipt', payload);

export async function createAndSubmitPurchaseReceipt({
  supplier,
  company,
  warehouse,
  lines,
  posting_date,
}) {
  const resolvedCompany = await resolveCompany(company);
  const check = validateReceiveForm({
    supplier,
    company: resolvedCompany,
    warehouse,
    lines,
  });
  if (!check.valid) {
    const err = new Error(check.errors.join(' '));
    err.validationErrors = check.errors;
    throw err;
  }

  const today = posting_date || new Date().toISOString().slice(0, 10);
  const res = await createPurchaseReceipt({
    supplier,
    company: resolvedCompany,
    posting_date: today,
    set_warehouse: warehouse,
    items: lines.map((line) => ({
      item_code: line.item_code.trim(),
      qty: Number(line.qty),
      rate: Number(line.rate) || 0,
      warehouse: line.warehouse || warehouse,
    })),
  });

  const name = res?.data?.data?.name;
  if (!name) throw new Error('Purchase Receipt was not created');
  const result = await submitDoc('Purchase Receipt', name, getPurchaseReceipt);
  logActivity({
    type: ActivityType.PURCHASE,
    action: 'Purchase receipt submitted',
    detail: { name: result.name, supplier, warehouse },
  });
  return result;
}

/* ── Purchase Invoice ── */

export const listPurchaseInvoices = (params = {}) =>
  api.get('/api/resource/Purchase Invoice', {
    params: {
      fields: JSON.stringify([
        'name',
        'supplier',
        'posting_date',
        'due_date',
        'grand_total',
        'outstanding_amount',
        'status',
        'docstatus',
        'bill_no',
      ]),
      filters: JSON.stringify(params.filters || [['docstatus', '!=', 2]]),
      order_by: 'posting_date desc',
      limit_page_length: params.limit || 100,
    },
  });

export const getPurchaseInvoice = async (name) => {
  const res = await api.get(`/api/resource/Purchase Invoice/${encodeURIComponent(name)}`);
  return res?.data?.data;
};

export const createPurchaseInvoice = (payload) =>
  api.post('/api/resource/Purchase Invoice', payload);

export async function createAndSubmitPurchaseInvoice({
  supplier,
  company,
  lines,
  posting_date,
  due_date,
  bill_no,
}) {
  const resolvedCompany = await resolveCompany(company);
  const check = validatePurchaseInvoiceForm({
    supplier,
    company: resolvedCompany,
    lines,
  });
  if (!check.valid) {
    const err = new Error(check.errors.join(' '));
    err.validationErrors = check.errors;
    throw err;
  }

  const today = posting_date || new Date().toISOString().slice(0, 10);
  const res = await createPurchaseInvoice({
    supplier,
    company: resolvedCompany,
    posting_date: today,
    due_date: due_date || today,
    bill_no: bill_no || undefined,
    items: lines.map((line) => ({
      item_code: line.item_code.trim(),
      qty: Number(line.qty),
      rate: Number(line.rate) || 0,
      warehouse: line.warehouse || undefined,
    })),
  });

  const name = res?.data?.data?.name;
  if (!name) throw new Error('Purchase Invoice was not created');
  const result = await submitDoc('Purchase Invoice', name, getPurchaseInvoice);
  logActivity({
    type: ActivityType.PURCHASE,
    action: 'Purchase invoice submitted',
    detail: { name: result.name, supplier },
  });
  return result;
}

/**
 * @deprecated Use invoiceMatchingService.linkReceiptToInvoice — server validates all rules.
 */
export { linkReceiptToInvoice } from './invoiceMatchingService';

export const listSupplierGroups = () =>
  api.get('/api/resource/Supplier Group', {
    params: {
      fields: JSON.stringify(['name']),
      limit_page_length: 50,
    },
  });
