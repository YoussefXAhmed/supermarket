import { api } from './api';

const BASE = '/api/method/elmahdi.api.item_master';

export async function getItemMaster(itemCode) {
  const res = await api.get(`${BASE}.get_item_master`, {
    params: { item_code: itemCode },
  });
  return res?.data?.message || null;
}

export async function updateItemMaster(itemCode, fields) {
  const res = await api.post(`${BASE}.update_item_master`, {
    item_code: itemCode,
    ...fields,
  });
  return res?.data?.message || null;
}

export async function uploadItemImage(itemCode, file) {
  const form = new FormData();
  form.append('item_code', itemCode);
  form.append('file', file);
  const res = await api.post(`${BASE}.upload_item_image`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res?.data?.message || null;
}
