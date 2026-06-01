import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  listMyNotifications,
  countUnread,
  markRead,
  markAllRead,
} from '../../services/notificationsApi';
import { fmtDateTime } from '../../utils/format';

const POLL_MS = 30000;

function routeFor(doctype, name) {
  if (!doctype) return null;
  if (doctype === 'Purchase Receipt') return `/purchasing/history?name=${encodeURIComponent(name || '')}`;
  if (doctype === 'POS Closing Entry') return '/finance/approvals';
  if (doctype === 'Payment Entry') return '/finance/payments';
  return null;
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const popRef = useRef(null);

  const refreshCount = useCallback(async () => {
    try { setUnread(await countUnread()); } catch { /* ignore */ }
  }, []);

  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMyNotifications({ limit: 20 });
      setRows(res.rows || []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, POLL_MS);
    const onFocus = () => refreshCount();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [refreshCount]);

  useEffect(() => {
    if (open) refreshList();
  }, [open, refreshList]);

  // Close on outside click
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const onSelect = async (row) => {
    if (!row.read) {
      try { await markRead(row.name); } catch { /* ignore */ }
      refreshCount();
    }
    const path = routeFor(row.document_type, row.document_name);
    setOpen(false);
    if (path) navigate(path);
  };

  const onMarkAll = async () => {
    try { await markAllRead(); } catch { /* ignore */ }
    refreshCount();
    refreshList();
  };

  return (
    <div className="notif-bell" ref={popRef}>
      <button
        type="button"
        className="notif-bell__button"
        aria-label={t('notifications.title', { defaultValue: 'Notifications' })}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="notif-bell__badge" aria-label={`${unread} unread`}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-bell__panel" role="dialog" aria-label="Notifications">
          <header className="notif-bell__head">
            <strong>{t('notifications.title', { defaultValue: 'Notifications' })}</strong>
            {rows.length > 0 && (
              <button type="button" className="notif-bell__mark-all" onClick={onMarkAll}>
                {t('notifications.markAllRead', { defaultValue: 'Mark all read' })}
              </button>
            )}
          </header>
          <ul className="notif-bell__list">
            {loading && (
              <li className="notif-bell__empty">{t('ui.loading')}</li>
            )}
            {!loading && rows.length === 0 && (
              <li className="notif-bell__empty">
                {t('notifications.empty', { defaultValue: 'No notifications yet' })}
              </li>
            )}
            {!loading && rows.map((row) => (
              <li
                key={row.name}
                className={`notif-bell__item ${row.read ? 'notif-bell__item--read' : ''}`}
                onClick={() => onSelect(row)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect(row); }}
              >
                {!row.read && <span className="notif-bell__dot" aria-hidden />}
                <div className="notif-bell__item-body">
                  <p className="notif-bell__subject">{row.subject}</p>
                  <p className="notif-bell__meta">{fmtDateTime(row.creation)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
