import { useEffect } from 'react';

export const OPERATIONAL_REFRESH_EVENT = 'elmahdi:operational-refresh';

export const OperationalRefreshReason = {
  CHECKOUT: 'checkout',
  PURCHASE_APPROVAL: 'purchase_approval',
  STOCK_ENTRY: 'stock_entry',
  PURCHASE_RECEIPT: 'purchase_receipt',
  INVENTORY: 'inventory',
};

/** Notify all operational views to reload ERP-backed stock and purchasing data. */
export function dispatchOperationalRefresh(reason, detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OPERATIONAL_REFRESH_EVENT, { detail: { reason, ...detail } }),
  );
}

export function subscribeOperationalRefresh(handler) {
  if (typeof window === 'undefined') return () => {};
  const listener = (event) => handler(event.detail || {});
  window.addEventListener(OPERATIONAL_REFRESH_EVENT, listener);
  return () => window.removeEventListener(OPERATIONAL_REFRESH_EVENT, listener);
}

export function useOperationalRefresh(handler, deps = []) {
  useEffect(() => subscribeOperationalRefresh(handler), deps);
}
