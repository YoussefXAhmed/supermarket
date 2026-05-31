import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveActivePOSProfile } from '../services/posApi';
import { getOpenPOSOpeningEntry } from '../services/shiftsApi';
import { useAuth } from './useAuth';

/**
 * Shared "is there a live POS shift for me?" hook.
 *
 * Polls the backend every `intervalMs` (default 30s), revalidates on window
 * focus + visibility change, and exposes a manual `refetch()` for callers that
 * need a fresh read on demand (e.g. logout guard).
 *
 * Returns the active shift row (or null) plus a `shiftClosedExternally` signal
 * that fires once when a previously-open shift disappears — used by POSPage to
 * warn the cashier their shift was closed from ERPNext.
 */
export function useShiftPresence({ enabled = true, intervalMs = 30000 } = {}) {
  const { user, capabilities } = useAuth();
  const [activeShift, setActiveShift] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [shiftClosedExternally, setShiftClosedExternally] = useState(false);
  const previousRef = useRef(null);
  const profileRef = useRef(null);
  const inflightRef = useRef(null);

  const canCheck = enabled && Boolean(user?.name) && (capabilities?.canViewPOS || capabilities?.canOperatePOS);

  const fetchOnce = useCallback(async () => {
    if (!canCheck) return null;
    if (inflightRef.current) return inflightRef.current;
    const promise = (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!profileRef.current) {
          profileRef.current = await resolveActivePOSProfile();
        }
        const profile = profileRef.current;
        if (!profile?.name) {
          setActiveShift(null);
          return null;
        }
        const open = await getOpenPOSOpeningEntry(profile.name, user?.name);
        setActiveShift((prev) => {
          if (prev && !open) setShiftClosedExternally(true);
          return open;
        });
        previousRef.current = open;
        return open;
      } catch (e) {
        setError(e);
        return null;
      } finally {
        setLoading(false);
        inflightRef.current = null;
      }
    })();
    inflightRef.current = promise;
    return promise;
  }, [canCheck, user?.name]);

  useEffect(() => {
    if (!canCheck) return undefined;
    fetchOnce();
    const id = setInterval(fetchOnce, intervalMs);
    const onFocus = () => fetchOnce();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchOnce();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [canCheck, fetchOnce, intervalMs]);

  const acknowledgeExternalClose = useCallback(() => setShiftClosedExternally(false), []);

  return {
    activeShift,
    hasOpenShift: Boolean(activeShift?.name) && !activeShift?.pendingClose,
    loading,
    error,
    refetch: fetchOnce,
    shiftClosedExternally,
    acknowledgeExternalClose,
  };
}
