import { getItems, getStockLedger } from './api';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getInventorySnapshot({ itemLimit = 300, binLimit = 1000 } = {}) {
  const [itemsRes, binsRes] = await Promise.all([
    getItems({ limit: itemLimit }),
    getStockLedger({ limit: binLimit }),
  ]);

  const items = itemsRes?.data?.data || [];
  const bins = binsRes?.data?.data || [];

  const qtyByItem = new Map();
  const valuationByItem = new Map();
  for (const row of bins) {
    const code = row.item_code;
    if (!code) continue;
    const rowQty = toNum(row.actual_qty);
    qtyByItem.set(code, (qtyByItem.get(code) || 0) + rowQty);

    // Keep a sane fallback price from inventory valuation when selling price is unavailable.
    const valuationRate = toNum(row.valuation_rate);
    if (valuationRate > 0) {
      const prev = valuationByItem.get(code) || 0;
      // Prefer the highest non-zero valuation found across warehouses.
      if (valuationRate > prev) valuationByItem.set(code, valuationRate);
    }
  }

  const rows = items.map((item) => {
    const qty = qtyByItem.get(item.item_code) || 0;
    const standardRate = toNum(item.standard_rate);
    const valuationRate = valuationByItem.get(item.item_code) || 0;
    const price = standardRate > 0 ? standardRate : valuationRate;
    const value = qty * price;
    return {
      item_code: item.item_code,
      item_name: item.item_name,
      qty,
      price,
      value,
    };
  });

  rows.sort((a, b) => b.value - a.value);

  const totalProducts = rows.length;
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const lowStock = rows.filter((r) => r.qty > 0 && r.qty <= 5).length;
  const outOfStock = rows.filter((r) => r.qty <= 0).length;

  return {
    rows,
    metrics: { totalProducts, totalQty, totalValue, lowStock, outOfStock },
  };
}

