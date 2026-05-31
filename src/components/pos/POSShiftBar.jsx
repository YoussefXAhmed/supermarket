import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, Badge } from '../ui';

function prettyWarehouse(raw) {
  if (!raw) return '';
  // "WH - Main - ES" → "Main"; "Outer WH - ES" → "Outer WH". Strip ERP suffixes.
  return raw
    .replace(/\s*-\s*[A-Z]{2,4}$/, '') // trailing company abbr like "- ES"
    .replace(/^WH\s*-\s*/i, '') // leading "WH - "
    .trim();
}

export default function POSShiftBar({
  profile,
  shift,
  shiftOpen,
  shiftLoading,
  shiftError,
  onStartShift,
  onEndShift,
  onRefresh,
  readOnly = false,
}) {
  const { t } = useTranslation();
  const [showStart, setShowStart] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('0');
  const [openingMode, setOpeningMode] = useState('Cash');

  const handleStart = async () => {
    await onStartShift({
      openingAmount: Number(openingAmount) || 0,
      modeOfPayment: openingMode,
    });
    setShowStart(false);
  };

  const warehouse = prettyWarehouse(profile?.warehouse);

  // ── Compact no-shift CTA strip ──────────────────────────────────────
  if (!shiftOpen && !readOnly) {
    return (
      <div className="pos-shift-strip" role="status" aria-live="polite">
        <div className="pos-shift-strip__main">
          <span className="pos-shift-strip__icon" aria-hidden>⏱</span>
          <span className="pos-shift-strip__msg">
            <strong>{t('pos.noShiftTitle', { defaultValue: 'No shift open' })}</strong>
            <span className="pos-shift-strip__hint">
              {' · '}{t('pos.noShiftHint', { defaultValue: 'Open your drawer to start selling' })}
              {warehouse && (
                <span className="pos-shift-strip__wh"> · {t('pos.whLabel')} <strong>{warehouse}</strong></span>
              )}
            </span>
          </span>
          {shiftError && <span className="pos-shift-strip__error">{shiftError}</span>}
        </div>
        <div className="pos-shift-strip__actions">
          {!showStart && (
            <Btn variant="primary" size="sm" loading={shiftLoading} onClick={() => setShowStart(true)}>
              {t('pos.startShift')}
            </Btn>
          )}
          <Btn variant="ghost" size="sm" onClick={onRefresh} disabled={shiftLoading}>
            {t('common.refresh')}
          </Btn>
        </div>

        {showStart && (
          <div className="pos-shift-strip__form">
            <label className="pos-shift-strip__field">
              <span>{t('pos.openingAmountLabel')}</span>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                autoFocus
              />
            </label>
            <label className="pos-shift-strip__field">
              <span>{t('pos.modeLabel')}</span>
              <select className="input" value={openingMode} onChange={(e) => setOpeningMode(e.target.value)}>
                <option value="Cash">{t('pos.cash')}</option>
                <option value="Card">{t('pos.card')}</option>
              </select>
            </label>
            <div className="pos-shift-strip__form-actions">
              <Btn variant="primary" size="sm" loading={shiftLoading} onClick={handleStart}>
                {t('pos.confirmOpenShift')}
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => setShowStart(false)}>{t('common.cancel')}</Btn>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Compact open-shift status strip ──────────────────────────────────
  return (
    <div className="pos-shift-bar">
      <div className="pos-shift-bar__info">
        {shiftOpen ? (
          <Badge color="green">{t('pos.shiftOpen')}</Badge>
        ) : (
          <Badge color="red">{t('pos.noShift')}</Badge>
        )}
        <strong className="pos-shift-bar__profile">{profile?.name || '—'}</strong>
        {warehouse && (
          <span className="pos-shift-bar__entry">{t('pos.whLabel')} <strong>{warehouse}</strong></span>
        )}
        {shift?.name && (
          <span className="pos-shift-bar__entry pos-shift-bar__entry--muted mono">{shift.name}</span>
        )}
      </div>

      <div className="pos-shift-bar__actions">
        {!readOnly && shiftOpen && (
          <Btn variant="danger" size="sm" loading={shiftLoading} onClick={onEndShift}>
            {t('pos.endShift')}
          </Btn>
        )}
        <Btn variant="ghost" size="sm" onClick={onRefresh} disabled={shiftLoading}>
          {t('common.refresh')}
        </Btn>
      </div>

      {shiftError && <p className="pos-shift-bar__error">{shiftError}</p>}
    </div>
  );
}
