/**
 * POS stock validation helpers.
 */

export function availableQty(item) {
  if (item?.is_stock_item === 0 || item?.is_stock_item === false) return null;
  if (item.available_qty === undefined || item.available_qty === null) return null;
  return Math.max(0, Number(item.available_qty) || 0);
}

export function validateCartStock(cart) {
  const issues = [];
  for (const line of cart) {
    const issue = validateLineStock(line, line.qty);
    if (issue) issues.push(issue);
  }
  return issues;
}

export function validateLineStock(item, requestedQty) {
  if (item.disabled) {
    return { item_code: item.item_code, item_name: item.item_name, type: 'inactive', message: 'Item is inactive' };
  }
  const avail = availableQty(item);
  if (avail === null) return null;
  const qty = Number(requestedQty) || 0;
  if (avail <= 0) {
    return { item_code: item.item_code, item_name: item.item_name, type: 'out', message: 'Out of stock', available: 0 };
  }
  if (qty > avail) {
    return {
      item_code: item.item_code,
      item_name: item.item_name,
      type: 'insufficient',
      message: `Only ${avail} available`,
      available: avail,
    };
  }
  return null;
}

export function canAddToCart(item, currentQtyInCart = 0) {
  const avail = availableQty(item);
  if (avail === null) return { ok: true };
  if (avail <= 0) return { ok: false, reason: 'out', message: `${item.item_name || item.item_code} is out of stock` };
  if (currentQtyInCart + 1 > avail) {
    return { ok: false, reason: 'insufficient', message: `Only ${avail} of ${item.item_name || item.item_code} available` };
  }
  return { ok: true };
}
