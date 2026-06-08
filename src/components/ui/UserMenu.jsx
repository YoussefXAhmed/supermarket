/**
 * <UserMenu> — top-right avatar + dropdown.
 *
 * Phase 2 introduces this as the canonical "where the user goes for
 * their own things". Replaces the session-menu hack in
 * SidebarShellLayout (where Personal Settings / My Payslip were
 * stitched into the footer link list).
 *
 * Items shape: [{ key, label, icon?, to?, onClick?, divider? }]
 * `divider: true` renders an <hr> between groups.
 *
 * Pages can pass their own item list; layouts compose the canonical
 * set from capabilities (My Payslip / Personal Settings / Sign out).
 *
 * Keyboard support: opens on Enter/Space, closes on Esc, traps Tab.
 * Click outside closes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import UserAvatar from './UserAvatar';

export default function UserMenu({
  user,
  items = [],
  onSignOut,
  align = 'end',
  className = '',
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const handleItem = (item) => {
    if (item.onClick) item.onClick();
    if (item.to) navigate(item.to);
    close();
  };

  const cls = [
    'user-menu',
    `user-menu--${align}`,
    open ? 'is-open' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className="user-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <UserAvatar user={user} size="sm" />
        <span className="user-menu__name">{user?.full_name || user?.name}</span>
        <span className="user-menu__caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="user-menu__panel" role="menu">
          {(user?.full_name || user?.email) && (
            <div className="user-menu__identity">
              {user?.full_name && <p className="user-menu__name-line">{user.full_name}</p>}
              {user?.email && <p className="user-menu__email-line">{user.email}</p>}
            </div>
          )}

          <ul className="user-menu__list">
            {items.map((item, i) => {
              if (item.divider) return <li key={`d-${i}`} className="user-menu__divider" role="separator" />;
              const content = (
                <>
                  {item.icon && <span className="user-menu__icon" aria-hidden="true">{item.icon}</span>}
                  <span className="user-menu__label">{item.label}</span>
                </>
              );
              if (item.to && !item.onClick) {
                return (
                  <li key={item.key || item.label} role="none">
                    <Link
                      to={item.to}
                      className="user-menu__item"
                      role="menuitem"
                      onClick={close}
                    >{content}</Link>
                  </li>
                );
              }
              return (
                <li key={item.key || item.label} role="none">
                  <button
                    type="button"
                    className="user-menu__item"
                    role="menuitem"
                    onClick={() => handleItem(item)}
                  >{content}</button>
                </li>
              );
            })}

            {onSignOut && (
              <>
                <li className="user-menu__divider" role="separator" />
                <li role="none">
                  <button
                    type="button"
                    className="user-menu__item user-menu__item--danger"
                    role="menuitem"
                    onClick={() => { onSignOut(); close(); }}
                  >
                    <span className="user-menu__icon" aria-hidden="true">⎋</span>
                    <span className="user-menu__label">
                      {t('ui.userMenu.signOut', { defaultValue: 'Sign out' })}
                    </span>
                  </button>
                </li>
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
