import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/layout-system.css';
import './styles/enterprise.css';
import './styles/login.css';
import './styles/pos.css';
import './styles/admin.css';
import App from './App.jsx';
import { NotificationProvider } from './context/NotificationContext';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NotificationProvider>
      <App />
    </NotificationProvider>
  </StrictMode>
);
