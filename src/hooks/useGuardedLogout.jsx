import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';
import { useShiftPresence } from './useShiftPresence';
import { ConfirmDialog } from '../components/ui';

/**
 * Wraps the auth logout so cashiers with an open shift cannot leave the SPA
 * without closing it. Returns `{ requestLogout, guardModal }`. Layout/header
 * components render `{guardModal}` once and call `requestLogout` from the
 * logout button instead of using `useAuth().logout` directly.
 *
 * Only cashiers (operationalPersona === 'cashier') are gated. All other
 * personas log out immediately.
 */
export function useGuardedLogout() {
  const { t } = useTranslation();
  const { logout, capabilities } = useAuth();
  const navigate = useNavigate();
  const isCashier = capabilities?.operationalPersona === 'cashier';
  const presence = useShiftPresence({ enabled: isCashier });
  const [blocking, setBlocking] = useState(false);

  const performLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  const requestLogout = useCallback(async () => {
    if (!isCashier) {
      await performLogout();
      return;
    }
    // Force a fresh read so a stale state can't let a cashier slip out
    // between the last poll and the click.
    const shift = await presence.refetch();
    const stillOpen = Boolean(shift?.name) && !shift?.pendingClose;
    if (stillOpen) {
      setBlocking(true);
      return;
    }
    await performLogout();
  }, [isCashier, performLogout, presence]);

  const goCloseShift = useCallback(() => {
    setBlocking(false);
    const name = presence.activeShift?.name;
    navigate(name ? `/shifts/close?opening=${encodeURIComponent(name)}` : '/shifts/close');
  }, [navigate, presence.activeShift]);

  const guardModal = (
    <ConfirmDialog
      open={blocking}
      title={t('logoutBlocked.title', { defaultValue: 'Close your shift first' })}
      message={t('logoutBlocked.message', {
        defaultValue:
          'You have an open POS shift. Please close and reconcile it before signing out — cash variance must be recorded.',
      })}
      confirmLabel={t('logoutBlocked.closeNow', { defaultValue: 'Close shift now' })}
      cancelLabel={t('logoutBlocked.cancel', { defaultValue: 'Stay signed in' })}
      onCancel={() => setBlocking(false)}
      onConfirm={goCloseShift}
      variant="primary"
    />
  );

  return { requestLogout, guardModal };
}
