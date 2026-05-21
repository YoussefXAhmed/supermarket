import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, Badge } from '../ui';

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

  return (
    <div className="pos-shift-bar">
      <div className="pos-shift-bar__info">
        <span className="pos-shift-bar__label">{t('pos.profileLabel')}</span>
        <strong>{profile?.name || '—'}</strong>
        {profile?.warehouse && (
          <span className="pos-shift-bar__entry mono">WH: {profile.warehouse}</span>
        )}
        {shiftOpen ? (
          <Badge color="green">{t('pos.shiftOpen')}</Badge>
        ) : (
          <Badge color="red">{t('pos.noShift')}</Badge>
        )}
        {shift?.name && (
          <span className="pos-shift-bar__entry mono">{shift.name}</span>
        )}
      </div>

      <div className="pos-shift-bar__actions">
        {!readOnly && !shiftOpen && !showStart && (
          <Btn variant="primary" size="sm" loading={shiftLoading} onClick={() => setShowStart(true)}>
            {t('pos.startShift')}
          </Btn>
        )}
        {!readOnly && shiftOpen && (
          <Btn variant="danger" size="sm" loading={shiftLoading} onClick={onEndShift}>
            {t('pos.endShift')}
          </Btn>
        )}
        <Btn variant="ghost" size="sm" onClick={onRefresh} disabled={shiftLoading}>
          {t('common.refresh')}
        </Btn>
      </div>

      {!readOnly && showStart && !shiftOpen && (
        <div className="pos-shift-bar__form card">
          <p className="pos-shift-bar__form-title">{t('pos.openingBalance')}</p>
          <div className="pos-shift-bar__form-row">
            <label>
              {t('pos.openingAmountLabel')}
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
              />
            </label>
            <label>
              {t('pos.modeLabel')}
              <select className="input" value={openingMode} onChange={(e) => setOpeningMode(e.target.value)}>
                <option value="Cash">{t('pos.cash')}</option>
                <option value="Card">{t('pos.card')}</option>
              </select>
            </label>
          </div>
          <div className="pos-shift-bar__form-actions">
            <Btn variant="primary" size="sm" loading={shiftLoading} onClick={handleStart}>
              {t('pos.confirmOpenShift')}
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setShowStart(false)}>{t('common.cancel')}</Btn>
          </div>
        </div>
      )}

      {shiftError && <p className="pos-shift-bar__error">{shiftError}</p>}
    </div>
  );
}
