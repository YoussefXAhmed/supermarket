import { Btn } from '../../../components/ui';

export default function CashCountForm({
  actualCash,
  onActualCashChange,
  notes,
  onNotesChange,
  onSubmit,
  loading,
  disabled,
  submitLabel = 'Close shift',
}) {
  return (
    <form className="inv-form form-region" onSubmit={onSubmit}>
      <label>
        Counted cash (EGP)
        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          required
          value={actualCash}
          onChange={(e) => onActualCashChange(e.target.value)}
          disabled={disabled}
          autoFocus
        />
      </label>
      <label>
        Closing notes
        <textarea
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          disabled={disabled}
          placeholder="Optional — explain variance, drawer issues, etc."
        />
      </label>
      <Btn type="submit" variant="primary" loading={loading} disabled={disabled}>
        {submitLabel}
      </Btn>
    </form>
  );
}
