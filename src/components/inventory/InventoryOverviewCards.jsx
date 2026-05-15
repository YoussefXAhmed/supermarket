import { StatCard } from '../ui';
import { fmtCurrencyCompact, fmtNumber } from '../../utils/format';

export default function InventoryOverviewCards({ metrics }) {
  return (
    <section className="layout-grid layout-grid--kpi" aria-label="Inventory metrics">
      <StatCard label="Products" value={metrics.totalProducts} icon="📦" color="blue" compact />
      <StatCard label="Qty on hand" value={fmtNumber(metrics.totalQty, 0)} icon="🧮" color="green" compact />
      <StatCard label="Value" value={fmtCurrencyCompact(metrics.totalValue)} icon="💰" color="accent" compact />
      <StatCard label="Low stock" value={metrics.lowStock} icon="⚠️" color="amber" compact />
    </section>
  );
}
