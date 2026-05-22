import { useTranslation } from 'react-i18next';
import { Btn } from '../../../components/ui';
import { fmtCurrency, fmtDateTime } from '../../../utils/format';
import { canManagerActOnSession } from '../../../utils/shiftSessions';
import ShiftStatusBadge from './ShiftStatusBadge';

function DetailRow({ label, value, mono }) {
  return (
    <div className="shift-detail-row">
      <span className="shift-detail-row__label">{label}</span>
      <span className={`shift-detail-row__value ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  );
}

export default function ShiftSessionDetailDrawer({
  session,
  user,
  onClose,
  onApprove,
  onReject,
  canApprove,
}) {
  const { t } = useTranslation();
  if (!session) return null;

  const audit = session.audit;
  const showManagerActions = canManagerActOnSession(session, user, canApprove);
  const timeline = session.timeline || [];

  return (
    <div className="shift-drawer-overlay" role="presentation" onClick={onClose}>
      <aside
        className="shift-drawer card"
        role="dialog"
        aria-labelledby="shift-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shift-drawer__head">
          <div>
            <h2 id="shift-drawer-title" className="shift-drawer__title">
              {t('shifts.drawer.title')}
            </h2>
            <p className="shift-drawer__sub">
              {session.register} · {session.cashier}
            </p>
          </div>
          <button type="button" className="shift-drawer__close" onClick={onClose} aria-label={t('shifts.drawer.close')}>
            ✕
          </button>
        </header>

        <div className="shift-drawer__status">
          <ShiftStatusBadge session={session} />
        </div>

        {timeline.length > 0 && (
          <section className="shift-drawer__section shift-drawer__timeline">
            <h3>{t('shifts.drawer.approvalTimeline')}</h3>
            <ol className="shift-timeline">
              {timeline.map((ev) => (
                <li key={ev.key} className={`shift-timeline__item shift-timeline__item--${ev.key}`}>
                  <p className="shift-timeline__label">{ev.label}</p>
                  <p className="shift-timeline__actor">{ev.actor}</p>
                  <p className="shift-timeline__time">{ev.at ? fmtDateTime(ev.at) : '—'}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="shift-drawer__section">
          <h3>{t('shifts.drawer.timing')}</h3>
          <DetailRow label={t('shifts.drawer.openedAt')} value={fmtDateTime(session.openedAt)} />
          <DetailRow label={t('shifts.drawer.closedAt')} value={session.closedAt ? fmtDateTime(session.closedAt) : t('shifts.drawer.stillOpen')} />
          <DetailRow label={t('shifts.drawer.periodStart')} value={session.periodStart || '—'} />
          <DetailRow label={t('shifts.drawer.periodEnd')} value={session.periodEnd || '—'} />
        </section>

        <section className="shift-drawer__section">
          <h3>{t('shifts.drawer.sales')}</h3>
          <DetailRow label={t('shifts.drawer.invoiceCount')} value={session.invoicesCount ?? 0} mono />
          <DetailRow label={t('shifts.drawer.salesTotal')} value={fmtCurrency(session.salesTotal)} mono />
          {audit?.returns_count != null && (
            <DetailRow label={t('shifts.drawer.returns')} value={audit.returns_count} mono />
          )}
          {audit?.void_count != null && (
            <DetailRow label={t('shifts.drawer.voids')} value={audit.void_count} mono />
          )}
        </section>

        <section className="shift-drawer__section">
          <h3>{t('shifts.drawer.cashReconciliation')}</h3>
          <DetailRow label={t('shifts.drawer.expectedCash')} value={fmtCurrency(session.expectedCash)} mono />
          <DetailRow
            label={t('shifts.drawer.countedCash')}
            value={session.countedCash != null ? fmtCurrency(session.countedCash) : '—'}
            mono
          />
          <DetailRow
            label={t('shifts.drawer.variance')}
            value={session.closing ? fmtCurrency(session.variance) : '—'}
            mono
          />
          <DetailRow label={t('shifts.drawer.severity')} value={session.varianceSeverity || '—'} />
        </section>

        <section className="shift-drawer__section">
          <h3>{t('shifts.drawer.erpDocuments')}</h3>
          <DetailRow label={t('shifts.drawer.openingEntry')} value={session.openingName || '—'} mono />
          <DetailRow label={t('shifts.drawer.closingEntry')} value={session.closingName || '—'} mono />
          {audit?.notes && (
            <div className="shift-detail-row shift-detail-row--block">
              <span className="shift-detail-row__label">{t('shifts.drawer.notes')}</span>
              <p className="shift-detail-row__notes">{audit.notes}</p>
            </div>
          )}
        </section>

        <footer className="shift-drawer__footer">
          {showManagerActions && onApprove && (
            <Btn variant="primary" onClick={() => onApprove(session)}>
              {t('shifts.card.approveAndSubmit')}
            </Btn>
          )}
          {showManagerActions && onReject && (
            <Btn variant="danger" onClick={() => onReject(session)}>
              {t('shifts.card.reject')}
            </Btn>
          )}
          <Btn variant="ghost" onClick={onClose}>
            {t('shifts.drawer.close')}
          </Btn>
        </footer>
      </aside>
    </div>
  );
}
