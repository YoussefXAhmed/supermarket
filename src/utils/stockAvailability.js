/**
 * Single source of truth for sellable stock from ERP Bin rows.
 * Available = actual_qty − reserved_qty (never negative).
 */

export function binAvailableQty(bin) {
  if (!bin) return 0;
  return Math.max(0, Number(bin.actual_qty || 0) - Number(bin.reserved_qty || 0));
}

/** Sum available qty per item_code across one or more bin rows. */
export function aggregateAvailableByItem(bins) {
  const map = new Map();
  for (const bin of bins || []) {
    const code = bin.item_code;
    if (!code) continue;
    map.set(code, (map.get(code) || 0) + binAvailableQty(bin));
  }
  return map;
}

/** Attach normalized available_qty to catalog rows (stock items only). */
export function attachAvailableQty(items, stockByItem) {
  return (items || []).map((item) => {
    const isStock = item.is_stock_item !== 0 && item.is_stock_item !== false;
    const available_qty = isStock ? (stockByItem.get(item.item_code) ?? 0) : null;
    return { ...item, available_qty, is_stock_item: isStock };
  });
}
