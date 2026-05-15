import { useAuth } from '../../hooks/useAuth';

const LABELS = {
  admin: { label: 'Administrator', className: 'role-badge--admin' },
  manager: { label: 'Manager', className: 'role-badge--manager' },
  pos: { label: 'Cashier', className: 'role-badge--pos' },
  inventory: { label: 'Inventory', className: 'role-badge--inventory' },
};

export function getRoleKind({ isAdmin, isPOS, isInventory, isManager }) {
  if (isAdmin) return 'admin';
  if (isManager) return 'manager';
  if (isPOS) return 'pos';
  if (isInventory) return 'inventory';
  return null;
}

export default function RoleBadge() {
  const { isAdmin, isPOS, isInventory, isManager, roleLabel } = useAuth();
  const kind = getRoleKind({ isAdmin, isPOS, isInventory, isManager });
  if (!kind) return null;
  const meta = LABELS[kind] || { label: roleLabel || kind, className: '' };
  return (
    <span className={`role-badge ${meta.className}`} title={roleLabel}>
      {meta.label}
    </span>
  );
}
