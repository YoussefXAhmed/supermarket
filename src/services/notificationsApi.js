import { api } from './api';

const BASE = '/api/method/elmahdi.api.notifications';
const EMPTY = { rows: [], count: 0 };

export async function listMyNotifications({ unreadOnly = false, limit = 30 } = {}) {
  const res = await api.get(`${BASE}.list_my_notifications`, {
    params: { unread_only: unreadOnly ? 1 : 0, limit },
  });
  return res?.data?.message || EMPTY;
}

export async function countUnread() {
  const res = await api.get(`${BASE}.count_unread`);
  return res?.data?.message?.unread || 0;
}

export async function markRead(name) {
  const res = await api.post(`${BASE}.mark_read`, { name });
  return res?.data?.message || null;
}

export async function markAllRead() {
  const res = await api.post(`${BASE}.mark_all_read`);
  return res?.data?.message || { marked: 0 };
}
