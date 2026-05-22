import { useTranslation } from 'react-i18next';
import { StatCard } from '../../../components/ui';

export default function ShiftSummaryCard({ summary, opening }) {
  const { t } = useTranslation();
  if (!summary) return null;

  return (
    <div className="shift-summary-grid stats-grid">
      <StatCard label={t('shifts.summary.sales')} value={`EGP ${Number(summary.salesTotal || 0).toFixed(2)}`} icon="💰" color="accent" />
      <StatCard label={t('shifts.summary.invoices')} value={summary.salesCount ?? 0} icon="🧾" color="blue" />
      <StatCard label={t('shifts.summary.returns')} value={`EGP ${Number(summary.returnsTotal || 0).toFixed(2)}`} icon="↩" color="amber" />
      <StatCard label={t('shifts.summary.returnCount')} value={summary.returnsCount ?? 0} icon="↩" color="default" />
      <StatCard label={t('shifts.summary.voids')} value={summary.voidCount ?? 0} icon="⊘" color="red" />
      <StatCard label={t('shifts.summary.expectedCash')} value={`EGP ${Number(summary.expectedCash || 0).toFixed(2)}`} icon="💵" color="green" />
      {opening?.name && (
        <StatCard label={t('shifts.summary.openingEntry')} value={opening.name} icon="◷" color="default" />
      )}
      {summary.cardTotal > 0 && (
        <StatCard label={t('shifts.summary.cardOther')} value={`EGP ${Number(summary.cardTotal).toFixed(2)}`} icon="💳" color="blue" />
      )}
    </div>
  );
}
