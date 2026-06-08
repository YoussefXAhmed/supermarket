import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Btn, Textarea, FormField } from '../ui';

/**
 * Rejection dialog for a purchase approval (Goods Receipt / Purchase Invoice).
 *
 * Replaces the previous window.confirm() flow with a proper themed modal that
 * forces the rejecter to record a reason. The reason is what gets persisted to
 * the approval audit trail, so making it required is meaningful — not friction.
 *
 *   <RejectPurchaseModal
 *     open={!!target}
 *     docName={target}
 *     loading={busy}
 *     onCancel={() => setTarget(null)}
 *     onSubmit={async (reason) => { await reject(target, reason); setTarget(null); }}
 *   />
 */
export default function RejectPurchaseModal({
  open,
  docName,
  loading = false,
  onCancel,
  onSubmit,
  docKindLabel,
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  // Reset state every time the dialog re-opens for a new doc.
  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open, docName]);

  const trimmed = reason.trim();
  const reasonMissing = trimmed.length === 0;
  const kind = docKindLabel || t('approvals.goodsReceipt', { defaultValue: 'Goods Receipt' });

  const submit = (e) => {
    e?.preventDefault?.();
    setTouched(true);
    if (reasonMissing || loading) return;
    onSubmit?.(trimmed);
  };

  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onCancel}
      closeOnBackdrop={!loading}
      closeOnEsc={!loading}
      title={t('approvals.rejectModal.title', { defaultValue: 'Reject {{kind}}', kind })}
      size="md"
      footer={
        <>
          <Btn variant="ghost" size="md" onClick={onCancel} disabled={loading}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Btn>
          <Btn
            variant="danger"
            size="md"
            onClick={submit}
            loading={loading}
            disabled={loading || reasonMissing}
          >
            {t('approvals.rejectModal.confirm', { defaultValue: 'Reject {{kind}}', kind })}
          </Btn>
        </>
      }
    >
      <form onSubmit={submit} className="reject-modal">
        <p className="ui-modal__message">
          {t('approvals.rejectModal.confirmText', {
            defaultValue: 'Are you sure you want to reject {{kind}} {{name}}?',
            kind,
            name: docName || '',
          })}
        </p>
        <FormField
          label={t('approvals.rejectModal.reason', { defaultValue: 'Reason' })}
          required
          error={touched && reasonMissing ? t('approvals.rejectModal.reasonRequired', { defaultValue: 'A reason is required.' }) : null}
        >
          {({ id }) => (
            <Textarea
              id={id}
              rows={4}
              value={reason}
              autoFocus
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={t('approvals.rejectModal.reasonPlaceholder', {
                defaultValue: 'e.g. supplier delivered wrong quantity, price mismatch, damaged goods',
              })}
              invalid={touched && reasonMissing}
              disabled={loading}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}
