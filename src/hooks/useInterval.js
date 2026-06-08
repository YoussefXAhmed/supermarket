/**
 * useInterval — pause-aware polling hook.
 *
 * Calls `callback` every `delay` milliseconds. The interval is
 * automatically paused when the document is hidden (the tab is in the
 * background) and resumed on visibilitychange / focus. This matters at
 * ERP scale: 20 idle tabs polling every 30s burn server cycles for no
 * one's benefit.
 *
 *   useInterval(refreshQueue, 30_000, { paused: !isLive });
 *
 * Returns `{ pause, resume, force }` so callers can drive the lifecycle
 * imperatively (e.g. pause while a mutation is in flight, force an
 * immediate refetch on user action).
 *
 * Implementation notes:
 *   - The callback is wrapped in a ref so the interval doesn't restart
 *     when an unstable callback identity changes. This is the standard
 *     useInterval pattern.
 *   - `delay = null` disables the interval entirely without unmounting
 *     the hook (handy for feature-flag gating).
 *   - We don't fire the callback immediately on mount — call `force()`
 *     from your consumer if you want a leading fetch. (Choosing leading
 *     fetch per-call gives the caller control over duplicate work when
 *     multiple sibling hooks should share an initial fetch.)
 */
import { useCallback, useEffect, useRef } from 'react';

/**
 * @param {() => void | Promise<void>} callback
 * @param {number | null} delay  Milliseconds between calls; null to disable.
 * @param {{ paused?: boolean }} [opts]
 * @returns {{ pause: () => void, resume: () => void, force: () => void }}
 */
export function useInterval(callback, delay, opts = {}) {
  const { paused = false } = opts;
  const savedCallback = useRef(callback);
  const timerRef = useRef(null);
  const pausedRef = useRef(paused);

  // Keep the latest callback in a ref so re-running the effect on every
  // delay change doesn't drop callback identity changes.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const tick = useCallback(() => {
    if (pausedRef.current) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const r = savedCallback.current?.();
      // Swallow promise rejections inside the interval so a transient
      // network blip doesn't terminate the loop.
      if (r && typeof r.then === 'function') r.catch(() => {});
    } catch {
      // Same: don't let a callback throw kill the interval.
    }
  }, []);

  useEffect(() => {
    if (delay == null) return undefined;
    timerRef.current = setInterval(tick, delay);
    const onFocus = () => {
      if (!pausedRef.current && (typeof document === 'undefined' || !document.hidden)) {
        tick();
      }
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        tick();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [delay, tick]);

  const pause = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    tick();
  }, [tick]);

  const force = useCallback(() => {
    // `force` ignores pause + hidden gates by design — it's the user
    // explicitly asking for a refresh.
    try {
      const r = savedCallback.current?.();
      if (r && typeof r.then === 'function') r.catch(() => {});
    } catch {
      /* noop */
    }
  }, []);

  return { pause, resume, force };
}

export default useInterval;
