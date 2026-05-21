import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';

const LABELS = {
  administrator: { labelKey: 'roles.administrator', className: 'role-badge--admin' },
  store_manager: { labelKey: 'roles.storeManager', className: 'role-badge--manager' },
  cashier: { labelKey: 'roles.cashier', className: 'role-badge--pos' },
  inventory: { labelKey: 'nav.inventory', className: 'role-badge--inventory' },
  purchasing: { labelKey: 'nav.purchasing', className: 'role-badge--purchasing' },
  desk_manager: { labelKey: 'roles.manager', className: 'role-badge--manager' },
  desk: { labelKey: 'roles.deskUser', className: '' },
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
  const { t } = useTranslation();
  const { operationalPersona, roleLabel, capabilities } = useAuth();
  const kind = capabilities?.canManageSystem
    ? 'administrator'
    : operationalPersona || getRoleKind(capabilities);
  if (!kind) return null;
  const meta = LABELS[kind] || { label: roleLabel || kind, className: '' };
  return (
    <span className={`role-badge ${meta.className}`} title={roleLabel}>
      {meta.labelKey ? t(meta.labelKey) : meta.label}
    </span>
  );
}
