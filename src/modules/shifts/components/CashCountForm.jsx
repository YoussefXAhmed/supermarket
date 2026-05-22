import { useTranslation } from 'react-i18next';
import { Btn } from '../../../components/ui';

export default function CashCountForm({
  actualCash,
  onActualCashChange,
  notes,
  onNotesChange,
  onSubmit,
  loading,
  disabled,
  submitLabel,
}) {
  const { t } = useTranslation();
  const label = submitLabel ?? t('shifts.cashCount.closeShift');

  return (
    <form className="inv-form form-region" onSubmit={onSubmit}>
      <label>
        {t('shifts.cashCount.countedCash')}
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
        {t('shifts.cashCount.closingNotes')}
        <textarea
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          disabled={disabled}
          placeholder={t('shifts.cashCount.placeholder')}
        />
      </label>
      <Btn type="submit" variant="primary" loading={loading} disabled={disabled}>
        {label}
      </Btn>
    </form>
  );
}
