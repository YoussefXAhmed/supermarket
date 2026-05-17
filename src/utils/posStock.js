/**
 * POS stock validation helpers.
 */

/**
 * @param {Array<{ warehouse: string, qty: number }>} bins
 * @param {string} posWarehouse
 */
export function alternateWarehouseHint(itemCode, bins, posWarehouse) {
  const others = (bins || []).filter(
    (b) => b.warehouse && b.warehouse !== posWarehouse && Number(b.qty) > 0,
  );
  if (!others.length) return null;
  const parts = others.map((b) => `${Number(b.qty)} in ${b.warehouse}`);
  return `${itemCode} available in ${parts.join(', ')} but not in ${posWarehouse}`;
}

export function availableQty(item) {
  if (item?.is_stock_item === 0 || item?.is_stock_item === false) return null;
  if (item.available_qty === undefined || item.available_qty === null) return null;
  return Math.max(0, Number(item.available_qty) || 0);
}

export function validateCartStock(cart, posWarehouse = '', binsByItem = null) {
  const issues = [];
  for (const line of cart) {
    const bins = binsByItem?.get?.(line.item_code) || null;
    const issue = validateLineStock(line, line.qty, posWarehouse, bins);
    if (issue) issues.push(issue);
  }
  return issues;
}

export function validateLineStock(item, requestedQty, posWarehouse = '', binsElsewhere = null) {
  if (item.disabled) {
    return { item_code: item.item_code, item_name: item.item_name, type: 'inactive', message: 'Item is inactive' };
  }
  const avail = availableQty(item);
  if (avail === null) return null;
  const qty = Number(requestedQty) || 0;
  const wh = posWarehouse || item.pos_warehouse || '';

  if (avail <= 0) {
    const alt = alternateWarehouseHint(item.item_code, binsElsewhere, wh);
    return {
      item_code: item.item_code,
      item_name: item.item_name,
      type: 'out',
      message: alt || (wh ? `Out of stock in ${wh}` : 'Out of stock'),
      available: 0,
    };
  }
  if (qty > avail) {
    const alt = alternateWarehouseHint(item.item_code, binsElsewhere, wh);
    const base = wh ? `Only ${avail} available in ${wh}` : `Only ${avail} available`;
    return {
      item_code: item.item_code,
      item_name: item.item_name,
      type: 'insufficient',
      message: alt ? `${base}. ${alt}` : base,
      available: avail,
    };
  }
  return null;
}

export function canAddToCart(item, currentQtyInCart = 0, posWarehouse = '') {
  const avail = availableQty(item);
  if (avail === null) return { ok: true };
  const wh = posWarehouse || item.pos_warehouse || '';
  const label = item.item_name || item.item_code;
  if (avail <= 0) {
    return {
      ok: false,
      reason: 'out',
      message: wh ? `${label} is out of stock in ${wh}` : `${label} is out of stock`,
    };
  }
  if (currentQtyInCart + 1 > avail) {
    return {
      ok: false,
      reason: 'insufficient',
      message: wh
        ? `Only ${avail} of ${label} available in ${wh}`
        : `Only ${avail} of ${label} available`,
    };
  }
  return { ok: true };
}
