/**
 * NotificationCenterContext — central poller for the user's Frappe
 * Notification Log.
 *
 * Login-spam prevention (Slack / Teams / Discord behaviour):
 *   • Bootstrap is a REF, not state. The first poll seeds the seen-set
 *     synchronously inside the same callback that runs the diff, so we can
 *     never fire on the initial load. Using a ref also prevents the
 *     stale-closure double-fire that a state-based bootstrap risks.
 *   • Pre-existing notifications (everything visible at login time) are added
 *     to `seenIds` with NO sound, NO toast — they appear in the bell + the
 *     /notifications inbox immediately but they are NOT "new".
 *   • Genuinely new arrivals trigger AT MOST one sound and ONE toast per
 *     3-second window. If 5 fresh rows land in the same poll, the toast
 *     reads "You have 5 new notifications" and clicking it opens the inbox.
 *
 * Cadence:
 *   • Poll every 15s + on every window focus.
 *   • The badge always reflects the server's true unread count; reading a
 *     notification mutates state optimistically so the badge ticks down
 *     immediately.
 *
 * Mount location: inside NotificationProvider (so it can call useNotify) and
 * inside BrowserRouter (so toast clicks can navigate).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  countUnread,
  listMyNotifications,
  markAllRead as apiMarkAllRead,
  markRead as apiMarkRead,
} from '../services/notificationsApi';
import { playNotificationSound } from '../utils/notificationSound';
import { useNotify } from './NotificationContext';
import { useAuth } from '../hooks/useAuth';

const NotificationCenterContext = createContext(null);

const POLL_MS = 15000;
const FETCH_LIMIT = 30;
const TOAST_MIN_GAP_MS = 3000; // matches the sound cooldown — one alert per 3s

function routeFor(doctype, name) {
  if (!doctype) return null;
  if (doctype === 'Purchase Receipt') return `/purchasing/history?name=${encodeURIComponent(name || '')}`;
  if (doctype === 'Purchase Invoice') return `/finance/payments?invoice=${encodeURIComponent(name || '')}`;
  if (doctype === 'POS Closing Entry') return '/finance/approvals';
  if (doctype === 'POS Opening Entry') return '/shifts/open';
  if (doctype === 'Payment Entry') return '/finance/payments';
  // Audit fix: SI / POS Invoice used to have no click-through.
  if (doctype === 'Sales Invoice') return `/finance/invoices?name=${encodeURIComponent(name || '')}`;
  if (doctype === 'POS Invoice') return `/pos?invoice=${encodeURIComponent(name || '')}`;
  // Inventory alerts (low stock / expiry) — both target the items list.
  if (doctype === 'Item') return `/inventory/items?focus=${encodeURIComponent(name || '')}`;
  if (doctype === 'Batch') return `/inventory/batches?focus=${encodeURIComponent(name || '')}`;
  return null;
}

export function NotificationCenterProvider({ children }) {
  const notify = useNotify();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [rows, setRows] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  // ──────────────────────────────────────────────────────────────────────
  // Refs that never trigger re-renders. Using refs (not state) for these
  // is deliberate — the announce/dedupe loop must read its own writes
  // *synchronously* inside the same callback, which state batching does not
  // guarantee, and a state-based `bootstrapped` flag would have caused a
  // stale-closure double-fire on the very first poll.
  // ──────────────────────────────────────────────────────────────────────
  const seenIdsRef = useRef(new Set());
  const bootstrappedRef = useRef(false);
  const pollingRef = useRef(false);
  const lastToastAtRef = useRef(0);
  // Buffer of fresh rows queued for the next aggregated toast — flushed at
  // most once per TOAST_MIN_GAP_MS.
  const pendingFreshRef = useRef([]);
  const toastFlushTimerRef = useRef(null);
  // Public, derived state — exposed so the bell can render "bootstrapped".
  const [bootstrapped, setBootstrapped] = useState(false);

  const handleToastClick = useCallback((row) => {
    // Mark read on click — the user has acknowledged it by opening the target.
    if (row?.name && !row.read) {
      apiMarkRead(row.name).catch(() => {});
      setRows((prev) =>
        prev.map((r) => (r.name === row.name ? { ...r, read: 1 } : r))
      );
      setUnread((u) => Math.max(0, u - 1));
    }
    const path = routeFor(row?.document_type, row?.document_name);
    if (path) navigate(path);
  }, [navigate]);

  /**
   * Drain the queue of fresh notifications into a single toast. Called by
   * a setTimeout when the queue is empty + the rate-limit window has passed.
   */
  const flushPendingToast = useCallback(() => {
    toastFlushTimerRef.current = null;
    const queue = pendingFreshRef.current;
    if (!queue.length) return;
    pendingFreshRef.current = [];
    lastToastAtRef.current = Date.now();

    if (queue.length === 1) {
      const r = queue[0];
      notify.notify(
        {
          title: r.subject || 'New notification',
          body: '',
          onClick: () => handleToastClick(r),
        },
        'info',
        5000,
      );
    } else {
      // Aggregated form (Slack / Teams style). Click opens the inbox.
      notify.notify(
        {
          title: `You have ${queue.length} new notifications`,
          body: queue[0].subject || '',
          onClick: () => { navigate('/notifications'); },
        },
        'info',
        5000,
      );
    }
  }, [notify, handleToastClick, navigate]);

  /**
   * Queue a batch of newly-arrived rows for announcement. The actual toast
   * fires AT MOST once per TOAST_MIN_GAP_MS, even if the user opens the
   * tab after a long absence and many notifications land in one poll.
   */
  const queueFreshForToast = useCallback((freshRows) => {
    if (!freshRows.length) return;
    pendingFreshRef.current.push(...freshRows);
    if (toastFlushTimerRef.current) return; // a flush is already scheduled
    const gap = Math.max(0, TOAST_MIN_GAP_MS - (Date.now() - lastToastAtRef.current));
    toastFlushTimerRef.current = setTimeout(flushPendingToast, gap);
  }, [flushPendingToast]);

  const refresh = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    setLoading(true);
    try {
      const res = await listMyNotifications({ limit: FETCH_LIMIT });
      const fetched = res?.rows || [];
      setRows(fetched);

      // Badge: total unread on the server. The list endpoint only returns
      // FETCH_LIMIT rows, so we fall back to the dedicated counter when the
      // response is "saturated" to keep the badge accurate.
      const unreadInResponse = fetched.filter((r) => !r.read).length;
      if (fetched.length >= FETCH_LIMIT) {
        try { setUnread(await countUnread()); } catch { setUnread(unreadInResponse); }
      } else {
        setUnread(unreadInResponse);
      }

      const seen = seenIdsRef.current;

      // ── Login / first-load case ──────────────────────────────────────
      // Everything visible at this moment is "pre-existing". Seed seenIds
      // and EXIT WITHOUT firing sound or toast. The bell badge already
      // shows the correct unread count thanks to the setUnread call above.
      if (!bootstrappedRef.current) {
        for (const r of fetched) seen.add(r.name);
        bootstrappedRef.current = true;
        setBootstrapped(true);
        return;
      }

      // ── Steady-state poll ────────────────────────────────────────────
      const fresh = fetched.filter((r) => !seen.has(r.name));
      if (fresh.length === 0) return;
      for (const r of fresh) seen.add(r.name);

      // Sound — capped at one per 3 seconds by the helper's own cooldown.
      playNotificationSound();
      // Toast — at most one per 3 seconds; multiple fresh rows aggregate.
      queueFreshForToast(fresh);
    } catch {
      /* network blip — keep prior state, try again next tick */
    } finally {
      pollingRef.current = false;
      setLoading(false);
    }
  // Intentionally stable: depends only on refs and the toast-queue helper.
  }, [queueFreshForToast]);

  // Tear down any pending toast flush on unmount (route changes, logout).
  useEffect(() => () => {
    if (toastFlushTimerRef.current) clearTimeout(toastFlushTimerRef.current);
  }, []);

  // On user identity change (login or logout) reset every announcement
  // state. The next refresh() will treat the new session as a fresh
  // bootstrap — pre-existing notifications get seeded silently, only
  // post-login arrivals fire sound + toast.
  useEffect(() => {
    seenIdsRef.current = new Set();
    bootstrappedRef.current = false;
    pendingFreshRef.current = [];
    if (toastFlushTimerRef.current) {
      clearTimeout(toastFlushTimerRef.current);
      toastFlushTimerRef.current = null;
    }
    lastToastAtRef.current = 0;
    setBootstrapped(false);
    setRows([]);
    setUnread(0);
  }, [user]);

  // Start polling once we have a user. No fetches happen pre-login (which
  // also means the bootstrap timer doesn't waste itself on the login page).
  useEffect(() => {
    if (!user) return undefined;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, refresh]);

  const markRead = useCallback(async (name) => {
    // Optimistic: drop unread immediately for snappy badge update.
    let wasUnread = false;
    setRows((prev) => prev.map((r) => {
      if (r.name === name) {
        if (!r.read) wasUnread = true;
        return { ...r, read: 1 };
      }
      return r;
    }));
    if (wasUnread) setUnread((u) => Math.max(0, u - 1));
    try { await apiMarkRead(name); } catch { /* server retries next poll */ }
  }, []);

  const markAllRead = useCallback(async () => {
    setRows((prev) => prev.map((r) => ({ ...r, read: 1 })));
    setUnread(0);
    try { await apiMarkAllRead(); } catch { /* will re-sync on next poll */ }
  }, []);

  const openTarget = useCallback((row) => {
    if (row?.name && !row.read) markRead(row.name);
    const path = routeFor(row?.document_type, row?.document_name);
    if (path) navigate(path);
  }, [markRead, navigate]);

  const value = useMemo(() => ({
    rows,
    unread,
    loading,
    bootstrapped,
    refresh,
    markRead,
    markAllRead,
    openTarget,
  }), [rows, unread, loading, bootstrapped, refresh, markRead, markAllRead, openTarget]);

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter() {
  const ctx = useContext(NotificationCenterContext);
  if (!ctx) {
    // Be permissive — a component rendered outside the provider just sees
    // an empty state rather than crashing the tree.
    return {
      rows: [],
      unread: 0,
      loading: false,
      bootstrapped: false,
      refresh: () => {},
      markRead: () => {},
      markAllRead: () => {},
      openTarget: () => {},
    };
  }
  return ctx;
}
