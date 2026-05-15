import { StatCard } from '../ui';
import { fmtCurrencyCompact, fmtNumber } from '../../utils/format';

export default function InventoryOverviewCards({ metrics, showValuation = true }) {
  return (
    <section className="layout-grid layout-grid--kpi" aria-label="Inventory metrics">
      <StatCard label="Products" value={metrics.totalProducts} icon="📦" color="blue" compact />
      <StatCard label="Qty on hand" value={fmtNumber(metrics.totalQty, 0)} icon="🧮" color="green" compact />
      {showValuation ? (
        <StatCard label="Value" value={fmtCurrencyCompact(metrics.totalValue)} icon="💰" color="accent" compact />
      ) : null}
      <StatCard label="Low stock" value={metrics.lowStock} icon="⚠️" color="amber" compact />
    </section>
  );
}
