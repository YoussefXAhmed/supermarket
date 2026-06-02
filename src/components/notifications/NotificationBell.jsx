import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  listMyNotifications,
  countUnread,
  markRead,
  markAllRead,
} from '../../services/notificationsApi';
import { fmtDateTime } from '../../utils/format';

const PANEL_W = 360;
const PANEL_MAX_H = 480;
const PANEL_GAP = 8;
const VIEWPORT_MARGIN = 12;

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
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState({});

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

  // Close on outside click (excluding the button + panel themselves)
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      const target = e.target;
      if (
        (buttonRef.current && buttonRef.current.contains(target)) ||
        (panelRef.current && panelRef.current.contains(target))
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Position the floating panel relative to the button — flips above when
  // there's no room below (sidebar-footer placement) and clamps to viewport.
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(PANEL_W, vw - 2 * VIEWPORT_MARGIN);
    // Default: align panel's right edge with button's right edge.
    let left = rect.right - w;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (left + w > vw - VIEWPORT_MARGIN) left = vw - VIEWPORT_MARGIN - w;
    const spaceBelow = vh - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const useAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxH = Math.min(PANEL_MAX_H, useAbove ? spaceAbove - PANEL_GAP : spaceBelow - PANEL_GAP);
    const top = useAbove
      ? Math.max(VIEWPORT_MARGIN, rect.top - PANEL_GAP - maxH)
      : rect.bottom + PANEL_GAP;
    setPanelStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${w}px`,
      maxHeight: `${maxH}px`,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

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

  const panel = open && (
    <div
      ref={panelRef}
      className="notif-bell__panel"
      role="dialog"
      aria-label="Notifications"
      style={panelStyle}
    >
      <header className="notif-bell__head">
        <strong>{t('notifications.title', { defaultValue: 'Notifications' })}</strong>
        {rows.length > 0 && (
          <button type="button" className="notif-bell__mark-all" onClick={onMarkAll}>
            {t('notifications.markAllRead', { defaultValue: 'Mark all read' })}
          </button>
        )}
      </header>
      <ul className="notif-bell__list">
        {loading && <li className="notif-bell__empty">{t('ui.loading')}</li>}
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
  );

  return (
    <div className="notif-bell">
      <button
        ref={buttonRef}
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
      {panel && typeof document !== 'undefined' && createPortal(panel, document.body)}
    </div>
  );
}
