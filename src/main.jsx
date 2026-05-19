import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { NotificationProvider } from './context/NotificationContext';
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NotificationProvider>
      <App />
    </NotificationProvider>
  </StrictMode>
);
