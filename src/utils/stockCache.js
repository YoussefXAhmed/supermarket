/** Cross-module stock cache invalidation (POS + inventory). */

import { dispatchOperationalRefresh, OperationalRefreshReason } from '../services/operationalRefresh';
import { bumpStockVersion } from '../services/stockService';

export const STOCK_INVALIDATE_EVENT = 'elmahdi:stock-invalidate';

const SOURCE_TO_REASON = {
  pos_checkout: OperationalRefreshReason.CHECKOUT,
  purchase_receipt: OperationalRefreshReason.PURCHASE_RECEIPT,
  purchase_approval: OperationalRefreshReason.PURCHASE_APPROVAL,
  stock_entry: OperationalRefreshReason.STOCK_ENTRY,
  inventory: OperationalRefreshReason.INVENTORY,
};

export function invalidateStockCache(detail = {}) {
  if (typeof window === 'undefined') return;
  bumpStockVersion();
  window.dispatchEvent(new CustomEvent(STOCK_INVALIDATE_EVENT, { detail }));
  const reason = SOURCE_TO_REASON[detail.source] || OperationalRefreshReason.INVENTORY;
  dispatchOperationalRefresh(reason, detail);
}
