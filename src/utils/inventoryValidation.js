/**
 * Client-side guards for inventory stock movements (ERP remains authoritative).
 */

export function availableBinQty(bin) {
  return Math.max(0, Number(bin?.actual_qty || 0) - Number(bin?.reserved_qty || 0));
}

export function validateStockEntry({ stock_entry_type, item_code, qty, source_warehouse, target_warehouse, sourceQty }) {
  const errors = [];
  const quantity = Number(qty);

  if (!item_code?.trim()) errors.push('Item is required.');
  if (!Number.isFinite(quantity) || quantity <= 0) errors.push('Quantity must be greater than zero.');

  if (stock_entry_type === 'Material Transfer') {
    if (!source_warehouse || !target_warehouse) {
      errors.push('Source and target warehouses are required for transfers.');
    } else if (source_warehouse === target_warehouse) {
      errors.push('Source and target warehouse must be different.');
    }
  }

  if (stock_entry_type === 'Material Issue' || stock_entry_type === 'Material Transfer') {
    if (!source_warehouse) errors.push('Source warehouse is required.');
    if (sourceQty != null && quantity > sourceQty) {
      errors.push(`Insufficient stock at source (available: ${sourceQty}).`);
    }
  }

  if (stock_entry_type === 'Material Receipt' && !target_warehouse) {
    errors.push('Target warehouse is required for receipts.');
  }

  return { valid: errors.length === 0, errors };
}

export function validateReconciliationLine({ qty, currentQty }) {
  const errors = [];
  const q = Number(qty);
  if (!Number.isFinite(q) || q < 0) errors.push('Quantity cannot be negative.');
  if (Number.isFinite(currentQty) && q < 0) errors.push('Invalid adjustment quantity.');
  return { valid: errors.length === 0, errors };
}
