import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/login.css';
import './styles/pos.css';
import './styles/admin.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
