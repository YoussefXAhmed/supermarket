import { useTranslation } from 'react-i18next';
import { StatCard } from '../ui';
import { fmtCurrencyCompact, fmtNumber } from '../../utils/format';

export default function InventoryOverviewCards({ metrics, showValuation = true }) {
  const { t } = useTranslation();
  return (
    <section className="layout-grid layout-grid--kpi" aria-label="Inventory metrics">
      <StatCard label={t('inventory.kpi.products')} value={metrics.totalProducts} icon="📦" color="blue" compact />
      <StatCard label={t('inventory.kpi.qtyOnHand')} value={fmtNumber(metrics.totalQty, 0)} icon="🧮" color="green" compact />
      {showValuation ? (
        <StatCard label={t('inventory.kpi.value')} value={fmtCurrencyCompact(metrics.totalValue)} icon="💰" color="accent" compact />
      ) : null}
      <StatCard label={t('inventory.kpi.lowStock')} value={metrics.lowStock} icon="⚠️" color="amber" compact />
    </section>
  );
}
