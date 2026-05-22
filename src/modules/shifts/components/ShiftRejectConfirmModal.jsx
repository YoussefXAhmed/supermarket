import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn } from '../../../components/ui';
import { fmtCurrency } from '../../../utils/format';

export default function ShiftRejectConfirmModal({
  session,
  loading,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  if (!session) return null;

  return (
    <div className="shift-modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="shift-modal card"
        role="dialog"
        aria-labelledby="shift-reject-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="shift-reject-title" className="shift-modal__title">
          {t('shifts.rejectModal.title')}
        </h2>
        <p className="shift-modal__lead">
          This marks <strong className="mono">{session.closingName}</strong> as rejected in ERP remarks.
          The draft will <strong>not</strong> be submitted. The cashier may need to close the shift again.
        </p>

        <ul className="shift-modal__facts">
          <li>
            <span>{t('shifts.rejectModal.cashier')}</span>
            <strong>{session.cashier}</strong>
          </li>
          <li>
            <span>{t('shifts.rejectModal.variance')}</span>
            <strong className="mono">{fmtCurrency(session.variance)}</strong>
          </li>
        </ul>

        <label className="shift-modal__reason">
          <span>{t('shifts.rejectModal.reason')}</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('shifts.rejectModal.placeholder')}
          />
        </label>

        <div className="shift-modal__actions">
          <Btn variant="ghost" onClick={onCancel} disabled={loading}>
            {t('common.cancel')}
          </Btn>
          <Btn
            variant="danger"
            loading={loading}
            onClick={() => onConfirm(reason.trim())}
          >
            {t('shifts.rejectModal.rejectClosing')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
