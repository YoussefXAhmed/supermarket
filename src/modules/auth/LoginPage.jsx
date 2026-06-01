import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { login, logout as apiLogout } from '../../services/api';
import { logActivity, ActivityType } from '../../services/activityLogService';
import { useAuth } from '../../hooks/useAuth';
import { getLoginErrorMessage } from '../../utils/errorHandling';
import { Btn } from '../../components/ui';
import '../../styles/login.css';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function LoginPage() {
  const { t } = useTranslation();
  const [usr, setUsr]   = useState('');
  const [pwd, setPwd]   = useState('');
  const [err, setErr]   = useState('');
  const [loading, setLoading] = useState(false);
  const { loadUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      // Start from a clean ERP session so users never overlap.
      try { await apiLogout(); } catch { /* ignore */ }
      await sleep(120);

      await login(usr, pwd);
      await sleep(220);
      let authState = await loadUser();
      // ERPNext may need a brief moment to persist / expose role assignments.
      if (
        (!authState?.user || authState?.homePath === '/login') &&
        authState?.reason !== 'guest' &&
        authState?.reason !== 'roles-unreadable'
      ) {
        await sleep(380);
        authState = await loadUser();
      }

      if (import.meta.env.DEV) {
        console.info('[login] redirect', authState?.homePath, authState?.user?.name);
      }

      if (authState.user && authState.homePath && authState.homePath !== '/login') {
        logActivity({
          type: ActivityType.SYSTEM,
          action: 'login',
          user: authState.user?.email || authState.user?.name || usr,
          detail: { home: authState.homePath, persona: authState.capabilities?.operationalPersona },
        });
        navigate(authState.homePath, { replace: true });
      } else if (authState.reason === 'roles-unreadable') {
        setErr(
          authState.authError ||
            'Your role permissions could not be verified. Contact an administrator.'
        );
        if (import.meta.env.DEV && authState.authError?.includes('elmahdi')) {
          console.warn('[login] Install erp-custom/elmahdi on ERPNext — see erp-custom/README.md');
        }
      } else {
        setErr('Login failed: no workspace access is assigned to this account.');
      }
    } catch (e) {
      setErr(getLoginErrorMessage(e, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="login-bg__grid" />
        <div className="login-bg__glow" />
      </div>

      <div className="login-card">
        <div className="login-card__header">
          <img className="login-card__logo" src="/logo.png" alt="Elmahdi logo" />
          <h1 className="login-card__title">Elmahdi ERP</h1>
          <p className="login-card__sub">Sign in to your workspace</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email / Username</label>
            <input
              className="form-input"
              type="text"
              value={usr}
              onChange={e => setUsr(e.target.value)}
              placeholder="admin@example.com"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {err && <p className="login-error">{err}</p>}

          <Btn type="submit" variant="primary" size="lg" loading={loading} style={{ width: '100%' }}>
            Sign In
          </Btn>
        </form>

        <p className="login-hint">
          Elmahdi Supermarket
        </p>
      </div>
    </div>
  );
}
