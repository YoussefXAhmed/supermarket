import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { NotificationProvider } from './context/NotificationContext';
import { initObservability } from './services/observability';
import './i18n';

// Boot observability before React renders so component-tree errors get
// captured. No-op when VITE_SENTRY_DSN is unset (dev).
initObservability();
import './styles/admin.css';
import './styles/components.css';
import './styles/enterprise.css';
import './styles/globals.css';
import './styles/layout-system.css';
import './styles/layout.css';
import './styles/login.css';
import './styles/pos.css';
import './styles/shifts.css';
import './styles/purchasing.css';
import './styles/approvals.css';
import './styles/accounting.css';
import './styles/phase-2-primitives.css';
import './styles/reports.css';
// Liquid Glass — must load LAST so its chrome-only overrides win the cascade.
import './styles/glass.css';
// Modern UI layer — per-workspace identity, micro-interactions, icon system.
import './styles/modern.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NotificationProvider>
      <App />
    </NotificationProvider>
  </StrictMode>
);
