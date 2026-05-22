import { useTranslation } from 'react-i18next';
import { Btn } from '../../../components/ui';
import { fmtCurrency } from '../../../utils/format';

export default function ShiftApprovalConfirmModal({
  session,
  loading,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation();
  if (!session) return null;

  const notes = session.audit?.notes;

  return (
    <div className="shift-modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="shift-modal card"
        role="dialog"
        aria-labelledby="shift-approve-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="shift-approve-title" className="shift-modal__title">
          {t('shifts.approveModal.title')}
        </h2>
        <p className="shift-modal__lead">
          This submits the linked <strong className="mono">{session.closingName}</strong> in ERPNext.
          You cannot approve your own shift.
        </p>

        <ul className="shift-modal__facts">
          <li>
            <span>{t('shifts.approveModal.cashier')}</span>
            <strong>{session.cashier}</strong>
          </li>
          <li>
            <span>{t('shifts.approveModal.sales')}</span>
            <strong className="mono">{fmtCurrency(session.salesTotal)}</strong>
          </li>
          <li>
            <span>{t('shifts.approveModal.expectedCash')}</span>
            <strong className="mono">{fmtCurrency(session.expectedCash)}</strong>
          </li>
          <li>
            <span>{t('shifts.approveModal.countedCash')}</span>
            <strong className="mono">{fmtCurrency(session.countedCash)}</strong>
          </li>
          <li>
            <span>{t('shifts.approveModal.variance')}</span>
            <strong className="mono">{fmtCurrency(session.variance)}</strong>
          </li>
          {notes ? (
            <li className="shift-modal__facts-notes">
              <span>{t('shifts.approveModal.notes')}</span>
              <strong>{notes}</strong>
            </li>
          ) : null}
        </ul>

        <div className="shift-modal__actions">
          <Btn variant="ghost" onClick={onCancel} disabled={loading}>
            {t('common.cancel')}
          </Btn>
          <Btn variant="primary" loading={loading} onClick={onConfirm}>
            {t('approvals.approveAndSubmit')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
