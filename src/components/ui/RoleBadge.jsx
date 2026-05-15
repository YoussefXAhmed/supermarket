import { useAuth } from '../../hooks/useAuth';

const LABELS = {
  administrator: { label: 'Administrator', className: 'role-badge--admin' },
  store_manager: { label: 'Store Manager', className: 'role-badge--manager' },
  cashier: { label: 'Cashier', className: 'role-badge--pos' },
  inventory: { label: 'Inventory', className: 'role-badge--inventory' },
  purchasing: { label: 'Purchasing', className: 'role-badge--purchasing' },
  desk_manager: { label: 'Manager', className: 'role-badge--manager' },
  desk: { label: 'Desk User', className: '' },
};

/** @deprecated Use operationalPersona from capabilities */
export function getRoleKind(caps = {}) {
  const persona = caps.operationalPersona;
  if (persona && LABELS[persona]) return persona;
  if (caps.canManageSystem) return 'administrator';
  if (caps.isStoreManager || caps.isManager) return 'store_manager';
  if (caps.canOperatePOS) return 'cashier';
  if (caps.canAccessInventory) return 'inventory';
  if (caps.canAccessPurchasing) return 'purchasing';
  return null;
}

export default function RoleBadge() {
  const { operationalPersona, roleLabel, capabilities } = useAuth();
  const kind = operationalPersona || getRoleKind(capabilities);
  if (!kind) return null;
  const meta = LABELS[kind] || { label: roleLabel || kind, className: '' };
  return (
    <span className={`role-badge ${meta.className}`} title={roleLabel}>
      {meta.label}
    </span>
  );
}
