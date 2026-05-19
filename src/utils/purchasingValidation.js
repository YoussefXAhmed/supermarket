export function validateSupplierForm({ supplier_name, supplier_group }) {
  const errors = [];
  if (!supplier_name?.trim()) errors.push('Supplier name is required.');
  if (!supplier_group?.trim()) errors.push('Supplier group is required.');
  return { valid: errors.length === 0, errors };
}

export function validatePurchaseLines(lines) {
  const errors = [];
  if (!lines?.length) {
    errors.push('Add at least one line item.');
    return { valid: false, errors };
  }
  const seen = new Set();
  lines.forEach((line, i) => {
    const row = i + 1;
    if (!line.item_code?.trim()) errors.push(`Line ${row}: item is required.`);
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) errors.push(`Line ${row}: quantity must be greater than zero.`);
    const rate = Number(line.rate);
    if (!Number.isFinite(rate) || rate <= 0) errors.push(`Line ${row}: buying rate must be greater than zero.`);
    const key = `${line.item_code}|${line.warehouse || ''}`;
    if (seen.has(key)) errors.push(`Line ${row}: duplicate item/warehouse.`);
    seen.add(key);
  });
  return { valid: errors.length === 0, errors };
}

export function validateReceiveForm({ supplier, warehouse, company, lines }) {
  const errors = [];
  if (!supplier?.trim()) errors.push('Select a supplier.');
  if (!company?.trim()) errors.push('Company is required.');
  if (!warehouse?.trim()) errors.push('Receiving warehouse is required.');
  const lineCheck = validatePurchaseLines(lines);
  return { valid: errors.length === 0 && lineCheck.valid, errors: [...errors, ...lineCheck.errors] };
}

export function validatePurchaseInvoiceForm({ supplier, company, lines }) {
  const errors = [];
  if (!supplier?.trim()) errors.push('Select a supplier.');
  if (!company?.trim()) errors.push('Company is required.');
  const lineCheck = validatePurchaseLines(lines);
  return { valid: errors.length === 0 && lineCheck.valid, errors: [...errors, ...lineCheck.errors] };
}
