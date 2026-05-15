import { StatCard } from '../../../components/ui';

export default function ShiftSummaryCard({ summary, opening }) {
  if (!summary) return null;

  return (
    <div className="shift-summary-grid stats-grid">
      <StatCard label="Sales" value={`EGP ${Number(summary.salesTotal || 0).toFixed(2)}`} icon="💰" color="accent" />
      <StatCard label="Invoices" value={summary.salesCount ?? 0} icon="🧾" color="blue" />
      <StatCard label="Returns" value={`EGP ${Number(summary.returnsTotal || 0).toFixed(2)}`} icon="↩" color="amber" />
      <StatCard label="Return count" value={summary.returnsCount ?? 0} icon="↩" color="default" />
      <StatCard label="Voids" value={summary.voidCount ?? 0} icon="⊘" color="red" />
      <StatCard label="Expected cash" value={`EGP ${Number(summary.expectedCash || 0).toFixed(2)}`} icon="💵" color="green" />
      {opening?.name && (
        <StatCard label="Opening entry" value={opening.name} icon="◷" color="default" />
      )}
      {summary.cardTotal > 0 && (
        <StatCard label="Card / other" value={`EGP ${Number(summary.cardTotal).toFixed(2)}`} icon="💳" color="blue" />
      )}
    </div>
  );
}
