export default function ShiftHistoryFilters({
  filters,
  onChange,
  cashiers = [],
  registers = [],
}) {
  const set = (key, value) => onChange({ ...filters, [key]: value });

  return (
    <div className="shift-history-filters card">
      <div className="shift-history-filters__row">
        <label className="shift-history-filters__field">
          <span>Cashier</span>
          <select
            value={filters.cashier || ''}
            onChange={(e) => set('cashier', e.target.value)}
          >
            <option value="">All cashiers</option>
            {cashiers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="shift-history-filters__field">
          <span>Register</span>
          <select
            value={filters.register || ''}
            onChange={(e) => set('register', e.target.value)}
          >
            <option value="">All registers</option>
            {registers.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="shift-history-filters__field">
          <span>Status</span>
          <select
            value={filters.status || 'all'}
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="pending">Pending approval</option>
            <option value="submitted">Submitted</option>
            <option value="draft">Draft (other)</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>

        <label className="shift-history-filters__field">
          <span>Date</span>
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
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
