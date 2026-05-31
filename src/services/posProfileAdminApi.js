import { api } from './api';

const BASE = '/api/method/elmahdi.api.pos_profile_admin';

export async function listPOSProfilesAdmin() {
  const res = await api.get(`${BASE}.list_pos_profiles`);
  return res?.data?.message || { rows: [], count: 0 };
}

export async function getPOSProfileAdmin(name) {
  const res = await api.get(`${BASE}.get_pos_profile`, { params: { name } });
  return res?.data?.message || null;
}

export async function updatePOSProfileAdmin({ name, warehouse, sellingPriceList, disabled }) {
  const params = { name };
  if (warehouse !== undefined) params.warehouse = warehouse;
  if (sellingPriceList !== undefined) params.selling_price_list = sellingPriceList;
  if (disabled !== undefined) params.disabled = disabled ? 1 : 0;
  const res = await api.post(`${BASE}.update_pos_profile`, params);
  return res?.data?.message || null;
}

export async function listEligibleWarehouses(company = '') {
  const res = await api.get(`${BASE}.list_eligible_warehouses`, {
    params: { company: company || undefined },
  });
  return res?.data?.message?.rows || [];
}

export async function listEligiblePriceLists() {
  const res = await api.get(`${BASE}.list_eligible_price_lists`);
  return res?.data?.message?.rows || [];
}
