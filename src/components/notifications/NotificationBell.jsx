/**
 * NotificationBell — compact dropdown surfaced everywhere the app shell
 * renders the user header (every workspace + POS sidebar).
 *
 * Behaviour:
 *   - Reads state from <NotificationCenterContext> (single shared poller).
 *     No own polling. No own audio. Just rendering + interactions.
 *   - Shows the last 5 notifications (compact rows: title + timestamp +
 *     unread dot).
 *   - Mark all read button in the header.
 *   - "View all notifications" footer link → /notifications page.
 *   - Adaptive layout: dropdown anchored to the bell on desktop, drawer
 *     on mobile + when inside a sidebar (existing logic preserved).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useNotificationCenter } from '../../context/NotificationCenterContext';
import { fmtDateTime } from '../../utils/format';
import { NotificationsIcon, CloseIcon } from '../icons';

const DROPDOWN_W = 340;
const DROPDOWN_MIN_H = 200;
const DROPDOWN_MAX_H = 460;
const DROPDOWN_GAP = 8;
const DRAWER_W = 380;
const VIEWPORT_MARGIN = 12;
const MOBILE_BP = 640;
const DROPDOWN_PREVIEW = 5;

function routeFor(doctype, name) {
  if (!doctype) return null;
  if (doctype === 'Purchase Receipt') return `/purchasing/history?name=${encodeURIComponent(name || '')}`;
  if (doctype === 'Purchase Invoice') return `/finance/payments?invoice=${encodeURIComponent(name || '')}`;
  if (doctype === 'POS Closing Entry') return '/finance/approvals';
  if (doctype === 'POS Opening Entry') return '/shifts/open';
  if (doctype === 'Payment Entry') return '/finance/payments';
  if (doctype === 'Sales Invoice') return `/finance/invoices?name=${encodeURIComponent(name || '')}`;
  if (doctype === 'POS Invoice') return `/pos?invoice=${encodeURIComponent(name || '')}`;
  if (doctype === 'Item') return `/inventory/items?focus=${encodeURIComponent(name || '')}`;
  if (doctype === 'Batch') return `/inventory/batches?focus=${encodeURIComponent(name || '')}`;
  return null;
}

function isInsideSidebar(node) {
  let el = node;
  while (el && el !== document.body) {
    const cls = el.classList;
    if (cls?.contains('sidebar') || cls?.contains('sidebar__footer')) return true;
    el = el.parentElement;
  }
  return false;
}

export default function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { rows, unread, loading, markRead, markAllRead } = useNotificationCenter();
  const [open, setOpen] = useState(false);
  // "View all" opens a separate full-list drawer (independent of the small
  // dropdown anchored to the bell). The dropdown shows the last 5; the drawer
  // shows everything we've fetched (FETCH_LIMIT in the provider).
  const [drawerOpen, setDrawerOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const drawerRef = useRef(null);
  const [mode, setMode] = useState('dropdown');
  const [dropdownStyle, setDropdownStyle] = useState(null);
  // Triggers a one-shot ring animation on the bell icon when unread count
  // *increases* (i.e. a fresh notification arrived since last render).
  const [ringing, setRinging] = useState(false);
  const lastUnreadRef = useRef(unread);
  useEffect(() => {
    if (unread > lastUnreadRef.current) {
      setRinging(true);
      const id = setTimeout(() => setRinging(false), 900);
      return () => clearTimeout(id);
    }
    lastUnreadRef.current = unread;
    return undefined;
  }, [unread]);

  const previewRows = rows.slice(0, DROPDOWN_PREVIEW);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      const target = e.target;
      if (
        (buttonRef.current && buttonRef.current.contains(target)) ||
        (panelRef.current && panelRef.current.contains(target))
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // "View all" drawer — Esc closes; body scroll locked while open.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const updateDropdownPosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(DROPDOWN_W, vw - 2 * VIEWPORT_MARGIN);

    let left = rect.right - w;
    if (left < VIEWPORT_MARGIN) left = rect.left;
    if (left + w > vw - VIEWPORT_MARGIN) left = vw - VIEWPORT_MARGIN - w;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    const spaceBelow = vh - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const flipAbove = spaceBelow < DROPDOWN_MIN_H && spaceAbove > spaceBelow;
    const available = flipAbove ? spaceAbove : spaceBelow;
    const maxH = Math.max(DROPDOWN_MIN_H, Math.min(DROPDOWN_MAX_H, available - DROPDOWN_GAP));
    const top = flipAbove
      ? Math.max(VIEWPORT_MARGIN, rect.top - DROPDOWN_GAP - maxH)
      : rect.bottom + DROPDOWN_GAP;

    setDropdownStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${w}px`,
      maxHeight: `${maxH}px`,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return undefined;
    const isMobile = window.innerWidth < MOBILE_BP;
    const inSidebar = isInsideSidebar(buttonRef.current);
    const nextMode = isMobile || inSidebar ? 'drawer' : 'dropdown';
    setMode(nextMode);
    if (nextMode === 'dropdown') {
      updateDropdownPosition();
      const onResize = () => {
        const m = window.innerWidth < MOBILE_BP || isInsideSidebar(buttonRef.current)
          ? 'drawer' : 'dropdown';
        if (m !== nextMode) setMode(m);
        else updateDropdownPosition();
      };
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', updateDropdownPosition, true);
      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', updateDropdownPosition, true);
      };
    }
    const onResize = () => {
      const m = window.innerWidth < MOBILE_BP || isInsideSidebar(buttonRef.current)
        ? 'drawer' : 'dropdown';
      setMode(m);
      if (m === 'dropdown') updateDropdownPosition();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, updateDropdownPosition]);

  const onSelect = (row) => {
    if (row?.name && !row.read) markRead(row.name);
    const path = routeFor(row?.document_type, row?.document_name);
    setOpen(false);
    if (path) navigate(path);
  };

  const onMarkAll = (e) => {
    e?.stopPropagation?.();
    markAllRead();
  };

  const body = (
    <>
      <header className="notif-bell__head">
        <strong>{t('notifications.title', { defaultValue: 'Notifications' })}</strong>
        <div className="notif-bell__head-actions">
          {unread > 0 && (
            <button type="button" className="notif-bell__mark-all" onClick={onMarkAll}>
              {t('notifications.markAllRead', { defaultValue: 'Mark all read' })}
            </button>
          )}
          {mode === 'drawer' && (
            <button
              type="button"
              className="notif-bell__close"
              onClick={() => setOpen(false)}
              aria-label={t('common.close', { defaultValue: 'Close' })}
            ><CloseIcon size={18} /></button>
          )}
        </div>
      </header>
      <ul className="notif-bell__list notif-bell__list--compact">
        {loading && previewRows.length === 0 && (
          <li className="notif-bell__empty">{t('ui.loading')}</li>
        )}
        {!loading && previewRows.length === 0 && (
          <li className="notif-bell__empty">
            {t('notifications.empty', { defaultValue: 'No notifications yet' })}
          </li>
        )}
        {previewRows.map((row) => (
          <li
            key={row.name}
            className={`notif-bell__item notif-bell__item--compact ${row.read ? 'notif-bell__item--read' : ''}`}
            onClick={() => onSelect(row)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelect(row); }}
          >
            <span className={`notif-bell__dot${row.read ? ' notif-bell__dot--muted' : ''}`} aria-hidden />
            <div className="notif-bell__item-body">
              <p className="notif-bell__subject">{row.subject}</p>
              <p className="notif-bell__meta">{fmtDateTime(row.creation)}</p>
            </div>
          </li>
        ))}
      </ul>
      <footer className="notif-bell__foot">
        <button
          type="button"
          className="notif-bell__view-all"
          onClick={() => { setOpen(false); setDrawerOpen(true); }}
        >
          {t('notifications.viewAll', { defaultValue: 'View all notifications' })}
        </button>
      </footer>
    </>
  );

  // Full-list drawer body — same row visuals as the dropdown, but every row
  // and no footer link (this IS the "all" view).
  const fullBody = (
    <>
      <header className="notif-bell__head">
        <strong>{t('notifications.title', { defaultValue: 'Notifications' })}</strong>
        <div className="notif-bell__head-actions">
          {unread > 0 && (
            <button type="button" className="notif-bell__mark-all" onClick={onMarkAll}>
              {t('notifications.markAllRead', { defaultValue: 'Mark all read' })}
            </button>
          )}
          <button
            type="button"
            className="notif-bell__close"
            onClick={() => setDrawerOpen(false)}
            aria-label={t('common.close', { defaultValue: 'Close' })}
          ><CloseIcon size={18} /></button>
        </div>
      </header>
      <ul className="notif-bell__list notif-bell__list--compact">
        {loading && rows.length === 0 && (
          <li className="notif-bell__empty">{t('ui.loading')}</li>
        )}
        {!loading && rows.length === 0 && (
          <li className="notif-bell__empty">
            {t('notifications.empty', { defaultValue: 'No notifications yet' })}
          </li>
        )}
        {rows.map((row) => (
          <li
            key={row.name}
            className={`notif-bell__item notif-bell__item--compact ${row.read ? 'notif-bell__item--read' : ''}`}
            onClick={() => { onSelect(row); setDrawerOpen(false); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') { onSelect(row); setDrawerOpen(false); } }}
          >
            <span className={`notif-bell__dot${row.read ? ' notif-bell__dot--muted' : ''}`} aria-hidden />
            <div className="notif-bell__item-body">
              <p className="notif-bell__subject">{row.subject}</p>
              <p className="notif-bell__meta">{fmtDateTime(row.creation)}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );

  let overlay = null;
  if (open) {
    if (mode === 'drawer') {
      overlay = (
        <>
          <div className="notif-bell__backdrop" onClick={() => setOpen(false)} aria-hidden />
          <aside
            ref={panelRef}
            className="notif-bell__panel notif-bell__panel--drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t('notifications.title', { defaultValue: 'Notifications' })}
            style={{ width: `min(${DRAWER_W}px, 100vw)` }}
          >
            {body}
          </aside>
        </>
      );
    } else if (dropdownStyle) {
      overlay = (
        <div
          ref={panelRef}
          className="notif-bell__panel notif-bell__panel--dropdown notif-bell__panel--compact"
          role="dialog"
          aria-label={t('notifications.title', { defaultValue: 'Notifications' })}
          style={dropdownStyle}
        >
          {body}
        </div>
      );
    }
  }

  // Independent "View all" drawer — overlays the app regardless of which
  // workspace the user is in.
  const drawerOverlay = drawerOpen ? (
    <>
      <div className="notif-bell__backdrop" onClick={() => setDrawerOpen(false)} aria-hidden />
      <aside
        ref={drawerRef}
        className="notif-bell__panel notif-bell__panel--drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t('notifications.title', { defaultValue: 'Notifications' })}
        style={{ width: `min(${DRAWER_W}px, 100vw)` }}
      >
        {fullBody}
      </aside>
    </>
  ) : null;

  return (
    <div className="notif-bell">
      <button
        ref={buttonRef}
        type="button"
        className={`notif-bell__button${ringing ? ' notif-bell__button--ring' : ''}`}
        aria-label={t('notifications.title', { defaultValue: 'Notifications' })}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <NotificationsIcon size={20} />
        {unread > 0 && (
          <span className="notif-bell__badge" aria-label={`${unread} unread`}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {overlay && typeof document !== 'undefined' && createPortal(overlay, document.body)}
      {drawerOverlay && typeof document !== 'undefined' && createPortal(drawerOverlay, document.body)}
    </div>
  );
}
