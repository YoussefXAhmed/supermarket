import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Toast } from '../components/ui';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message, type = 'success', duration = 4500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const value = useMemo(
    () => ({
      notify,
      success: (msg, duration) => notify(msg, 'success', duration),
      warning: (msg, duration) => notify(msg, 'warning', duration),
      error: (msg, duration) => notify(msg, 'error', duration),
      info: (msg, duration) => notify(msg, 'info', duration),
      critical: (msg, duration) => notify(msg, 'critical', duration),
      dismiss,
    }),
    [notify, dismiss]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => dismiss(t.id)} />
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
