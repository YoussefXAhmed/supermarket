import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { Btn } from '../../components/ui';
import '../../styles/login.css';

export default function LoginPage() {
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
      await login(usr, pwd);
      const authState = await loadUser();
      if (authState.user) navigate('/pos', { replace: true });
      else setErr('Login failed: could not load user session.');
    } catch (e) {
      setErr(e.message || 'Invalid credentials');
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
          Powered by <span>ERPNext</span> · Frappe Framework
        </p>
      </div>
    </div>
  );
}
