import { StatCard } from '../ui';

export default function InventoryOverviewCards({ metrics }) {
  return (
    <div className="stats-grid" style={{ marginBottom: 16 }}>
      <StatCard label="Products" value={metrics.totalProducts} icon="📦" color="blue" />
      <StatCard label="Quantity In Stock" value={metrics.totalQty.toFixed(2)} icon="🧮" color="green" />
      <StatCard label="Inventory Value" value={`EGP ${metrics.totalValue.toFixed(2)}`} icon="💰" color="accent" />
      <StatCard label="Low Stock" value={metrics.lowStock} icon="⚠️" color="red" />
    </div>
  );
}

