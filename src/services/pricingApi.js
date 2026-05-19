import api from './api';

/**
 * Selling prices for item codes (requires Item Price read on server).
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchSellingItemPrices(itemCodes, priceList = null) {
  const codes = [...new Set((itemCodes || []).map((c) => String(c || '').trim()).filter(Boolean))];
  if (!codes.length) return {};

  const params = { item_codes: JSON.stringify(codes) };
  if (priceList) params.price_list = priceList;

  const res = await api.get('/api/method/elmahdi.api.pricing.get_selling_item_prices', { params });
  return res?.data?.message || {};
}
