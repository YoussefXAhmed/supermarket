import { useAuth } from '../../hooks/useAuth';

export default function WarehouseScopeBar({ warehouse, warehouses }) {
  const { capabilities } = useAuth();
  const scope = capabilities?.warehouseScope;
  const list = warehouses?.length
    ? warehouses
    : warehouse
      ? [warehouse]
      : scope?.allowedWarehouses || [];

  if (!list.length && scope?.source === 'erp') {
    return (
      <p className="warehouse-scope-bar warehouse-scope-bar--all">
        <span className="warehouse-scope-bar__badge">All assigned warehouses</span>
        <span className="warehouse-scope-bar__hint">Scoped by ERP user permissions</span>
      </p>
    );
  }

  if (!list.length) return null;

  return (
    <p className="warehouse-scope-bar">
      <span className="warehouse-scope-bar__label">Warehouse scope</span>
      {list.map((wh) => (
        <span key={wh} className="warehouse-scope-bar__badge">
          {wh}
        </span>
      ))}
    </p>
  );
}
