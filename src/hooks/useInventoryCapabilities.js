import { useAuth } from './useAuth';

/** Inventory capability flags from auth context. */
export function useInventoryCapabilities() {
  const auth = useAuth();
  return {
    canAccessInventory: auth.canAccessInventory,
    canInventoryOperate: auth.canInventoryOperate,
    canInventoryReceipt: auth.canInventoryReceipt,
    canInventoryTransfer: auth.canInventoryTransfer,
    canInventoryIssueTransfer: auth.canInventoryIssueTransfer,
    canInventoryReconcile: auth.canInventoryReconcile,
    canInventoryValuation: auth.canInventoryValuation,
    canInventoryViewValuation: auth.canInventoryViewValuation,
    canInventoryManage: auth.canInventoryManage,
    canInventoryAnalytics: auth.canInventoryAnalytics,
    warehouseScope: auth.warehouseScope,
  };
}
