/**
 * Personal Settings API — Phase 5.
 *
 * Every endpoint is scoped to `frappe.session.user`. The server refuses
 * Guest. No admin permissions involved.
 */
import api from './api';

const BASE = '/api/method/elmahdi.api.personal_settings';

// Profile
export async function getProfile() {
  const res = await api.get(`${BASE}.get_profile`);
  return res.data?.message || null;
}
export async function updateProfile(payload) {
  const res = await api.post(`${BASE}.update_profile`, {
    payload: JSON.stringify(payload || {}),
  });
  return res.data?.message;
}

// Language
export async function getLanguage() {
  const res = await api.get(`${BASE}.get_language`);
  return res.data?.message || { language: 'en' };
}
export async function updateLanguage(language) {
  const res = await api.post(`${BASE}.update_language`, { language });
  return res.data?.message;
}

// Notifications
export async function getNotifications() {
  const res = await api.get(`${BASE}.get_notifications`);
  return res.data?.message || {};
}
export async function updateNotifications(payload) {
  const res = await api.post(`${BASE}.update_notifications`, {
    payload: JSON.stringify(payload || {}),
  });
  return res.data?.message;
}

// Printing
export async function getPrinting() {
  const res = await api.get(`${BASE}.get_printing`);
  return res.data?.message || {};
}
export async function updatePrinting(payload) {
  const res = await api.post(`${BASE}.update_printing`, {
    payload: JSON.stringify(payload || {}),
  });
  return res.data?.message;
}

// Security
export async function changePassword({ oldPassword, newPassword }) {
  const res = await api.post(`${BASE}.change_password`, {
    old_password: oldPassword,
    new_password: newPassword,
  });
  return res.data?.message;
}
export async function listSessions() {
  const res = await api.get(`${BASE}.list_sessions`);
  return res.data?.message || [];
}
export async function revokeSession(sid) {
  const res = await api.post(`${BASE}.revoke_session`, { sid });
  return res.data?.message;
}
export async function loginHistory({ limit } = {}) {
  const res = await api.get(`${BASE}.login_history`, {
    params: { limit: limit || 50 },
  });
  return res.data?.message || [];
}

