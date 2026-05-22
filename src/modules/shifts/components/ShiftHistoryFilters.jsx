import { useTranslation } from 'react-i18next';

export default function ShiftHistoryFilters({
  filters,
  onChange,
  cashiers = [],
  registers = [],
}) {
  const { t } = useTranslation();
  const set = (key, value) => onChange({ ...filters, [key]: value });

  return (
    <div className="shift-history-filters card">
      <div className="shift-history-filters__row">
        <label className="shift-history-filters__field">
          <span>{t('shifts.filters.cashier')}</span>
          <select
            value={filters.cashier || ''}
            onChange={(e) => set('cashier', e.target.value)}
          >
            <option value="">{t('shifts.filters.allCashiers')}</option>
            {cashiers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="shift-history-filters__field">
          <span>{t('shifts.filters.register')}</span>
          <select
            value={filters.register || ''}
            onChange={(e) => set('register', e.target.value)}
          >
            <option value="">{t('shifts.filters.allRegisters')}</option>
            {registers.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="shift-history-filters__field">
          <span>{t('shifts.filters.status')}</span>
          <select
            value={filters.status || 'all'}
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="all">{t('shifts.filters.allStatuses')}</option>
            <option value="open">{t('shifts.filters.open')}</option>
            <option value="pending">{t('shifts.filters.pendingApproval')}</option>
            <option value="submitted">{t('shifts.filters.submitted')}</option>
            <option value="draft">{t('shifts.filters.draftOther')}</option>
            <option value="rejected">{t('shifts.filters.rejected')}</option>
          </select>
        </label>

        <label className="shift-history-filters__field">
          <span>{t('shifts.filters.date')}</span>
          <input
            type="date"
            value={filters.date || ''}
            onChange={(e) => set('date', e.target.value)}
          />
        </label>

        {(filters.cashier || filters.register || filters.date || (filters.status && filters.status !== 'all')) && (
          <button
            type="button"
            className="shift-history-filters__clear"
            onClick={() =>
              onChange({ cashier: '', register: '', status: 'all', date: '' })
            }
          >
            {t('shifts.filters.clearFilters')}
          </button>
        )}
      </div>
    </div>
  );
}
