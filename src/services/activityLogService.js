const STORAGE_KEY = 'supermarket_erp_activity_v1';
const MAX_ENTRIES = 500;

export const ActivityType = {
  SALE: 'sale',
  STOCK: 'stock',
  ADJUSTMENT: 'adjustment',
  USER: 'user',
  PURCHASE: 'purchase',
  RETURN: 'return',
  SHIFT: 'shift',
  SYSTEM: 'system',
};

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStore(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* quota or private mode */
  }
}

/**
 * Record a user or system action (persisted locally; sync to ERPNext Version/Comment optional).
 */
export function logActivity({ type, action, detail = {}, user = 'system', severity = 'info' }) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ts: new Date().toISOString(),
    type: type || ActivityType.SYSTEM,
    action,
    detail,
    user,
    severity,
  };
  const entries = [entry, ...readStore()];
  writeStore(entries);
  return entry;
}

export function getActivityLogs({ limit = 100, type, user } = {}) {
  let entries = readStore();
  if (type) entries = entries.filter((e) => e.type === type);
  if (user) entries = entries.filter((e) => e.user === user);
  return entries.slice(0, limit);
}

export function clearActivityLogs() {
  writeStore([]);
}

/** Fetch ERPNext audit trail when permitted (Activity Log doctype). */
export async function fetchERPActivityLogs(api, { limit = 50 } = {}) {
  try {
    const res = await api.get('/api/resource/Activity Log', {
      params: {
        fields: JSON.stringify(['name', 'subject', 'status', 'reference_doctype', 'reference_name', 'user', 'creation']),
        order_by: 'creation desc',
        limit_page_length: limit,
      },
    });
    return (res?.data?.data || []).map((row) => ({
      id: row.name,
      ts: row.creation,
      type: ActivityType.SYSTEM,
      action: row.subject || row.status,
      detail: { doctype: row.reference_doctype, name: row.reference_name },
      user: row.user,
      severity: 'info',
      source: 'erp',
    }));
  } catch {
    return [];
  }
}
