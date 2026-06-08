import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Toast } from '../components/ui';

const NotificationContext = createContext(null);

/**
 * Resolve the legacy positional signature into a unified options dict.
 *
 *   notify("msg")                                     → { type:'success', duration:4500 }
 *   notify("msg", "error")                            → { type:'error',   duration:4500 }  (legacy)
 *   notify("msg", "error", 6000)                      → { type:'error',   duration:6000 }  (legacy)
 *   notify("msg", 6000)                               → { type:'success', duration:6000 }  (legacy)
 *   notify("msg", { type:'error', duration:8000 })    → { type:'error',   duration:8000 }  (new)
 *   notify("msg", { action:{ label, onClick } })      → { type:'success', action:...  }    (new)
 *
 * Recognized opts keys (new shape):
 *   - type:      'success' | 'error' | 'warning' | 'info' | 'critical'
 *   - duration:  ms (0 disables auto-dismiss)
 *   - action:    { label: string, onClick: () => void } | ReactNode
 *                (an element is rendered as-is inside the toast footer)
 *   - dedupeKey: string — when supplied, replaces any existing toast
 *                with the same key instead of stacking another copy.
 *                Useful for high-frequency events like "Saving…".
 */
function normalizeOptions(legacyTypeOrOpts, legacyDuration) {
  if (legacyTypeOrOpts && typeof legacyTypeOrOpts === 'object') {
    return {
      type: legacyTypeOrOpts.type || 'success',
      duration: legacyTypeOrOpts.duration ?? 4500,
      action: legacyTypeOrOpts.action,
      dedupeKey: legacyTypeOrOpts.dedupeKey,
    };
  }
  if (typeof legacyTypeOrOpts === 'number') {
    return { type: 'success', duration: legacyTypeOrOpts };
  }
  return {
    type: legacyTypeOrOpts || 'success',
    duration: legacyDuration ?? 4500,
  };
}

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message, typeOrOpts = 'success', maybeDuration = undefined) => {
    const { type, duration, action, dedupeKey } = normalizeOptions(typeOrOpts, maybeDuration);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => {
      // Dedupe by key: replace any existing toast with the same key
      // instead of stacking another copy. Prevents notification spam
      // from fast-firing events.
      const filtered = dedupeKey
        ? prev.filter((t) => t.dedupeKey !== dedupeKey)
        : prev;
      return [...filtered, { id, message, type, action, dedupeKey }];
    });
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const value = useMemo(() => {
    // Helpers accept a second arg that is EITHER a number (legacy duration)
    // OR an options dict. Both flow through normalizeOptions, so call sites
    // can mix shapes without breaking.
    const make = (type) => (msg, opts) => {
      if (opts && typeof opts === 'object' && !Array.isArray(opts)) {
        return notify(msg, { ...opts, type });
      }
      // Legacy: opts is undefined or a number (duration).
      return notify(msg, type, opts);
    };
    return {
      notify,
      success: make('success'),
      warning: make('warning'),
      error: make('error'),
      info: make('info'),
      critical: make('critical'),
      dismiss,
    };
  }, [notify, dismiss]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <Toast
            key={t.id}
            message={t.message}
            type={t.type}
            action={t.action}
            onClose={() => dismiss(t.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotify must be used within NotificationProvider');
  return ctx;
}
