import { useState } from 'react';
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
        <span className="pos-shift-bar__label">Profile</span>
        <strong>{profile?.name || '—'}</strong>
        {profile?.warehouse && (
          <span className="pos-shift-bar__entry mono">WH: {profile.warehouse}</span>
        )}
        {shiftOpen ? (
          <Badge color="green">Shift open</Badge>
        ) : (
          <Badge color="red">No shift</Badge>
        )}
        {shift?.name && (
          <span className="pos-shift-bar__entry mono">{shift.name}</span>
        )}
      </div>

      <div className="pos-shift-bar__actions">
        {!readOnly && !shiftOpen && !showStart && (
          <Btn variant="primary" size="sm" loading={shiftLoading} onClick={() => setShowStart(true)}>
            Start shift
          </Btn>
        )}
        {!readOnly && shiftOpen && (
          <Btn variant="danger" size="sm" loading={shiftLoading} onClick={onEndShift}>
            End shift
          </Btn>
        )}
        <Btn variant="ghost" size="sm" onClick={onRefresh} disabled={shiftLoading}>
          Refresh
        </Btn>
      </div>

      {!readOnly && showStart && !shiftOpen && (
        <div className="pos-shift-bar__form card">
          <p className="pos-shift-bar__form-title">Opening balance</p>
          <div className="pos-shift-bar__form-row">
            <label>
              Amount (EGP)
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
              Mode
              <select className="input" value={openingMode} onChange={(e) => setOpeningMode(e.target.value)}>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
              </select>
            </label>
          </div>
          <div className="pos-shift-bar__form-actions">
            <Btn variant="primary" size="sm" loading={shiftLoading} onClick={handleStart}>
              Confirm & open shift
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setShowStart(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {shiftError && <p className="pos-shift-bar__error">{shiftError}</p>}
    </div>
  );
}
