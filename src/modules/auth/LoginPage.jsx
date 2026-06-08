/**
 * Login page — fully dynamic + Liquid Glass.
 *
 * What's dynamic:
 *   • Company name + logo pulled from ERPNext on mount
 *     (elmahdi.api.branding.get_login_branding — guest-accessible).
 *   • Language switcher EN↔AR with RTL flip; user choice persists in
 *     localStorage and pre-loads on next visit.
 *   • Show / hide password toggle.
 *   • Inline real-time validation (email shape + password presence).
 *   • Entrance fade + button press micro-feedback.
 *   • Liquid Glass surface inherits from glass.css.
 *
 * What stays the same:
 *   • Auth flow — same login() + loadUser() + redirect logic.
 *   • Activity logging on successful sign-in.
 *   • Error handling via getLoginErrorMessage(t).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { login, logout as apiLogout } from '../../services/api';
import { logActivity, ActivityType } from '../../services/activityLogService';
import { fetchLoginBranding } from '../../services/brandingApi';
import { useAuth } from '../../hooks/useAuth';
import { getLoginErrorMessage } from '../../utils/errorHandling';
import { Btn } from '../../components/ui';
import { ViewIcon as EyeIcon, CloseIcon as EyeOffPlaceholder } from '../../components/icons';
import '../../styles/login.css';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const LS_LANG = 'elmahdi:login:lang';

/** Validates either an email shape or a non-trivial username. */
function isValidIdentifier(value) {
  const v = String(value || '').trim();
  if (v.length < 3) return false;
  if (v.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  return /^[a-zA-Z0-9._\-+]+$/.test(v);
}

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { loadUser } = useAuth();

  // ── Branding ─────────────────────────────────────────────────────────
  const [branding, setBranding] = useState({
    company_name: 'Elmahdi ERP',
    logo_url: '/logo.png',
    languages: [
      { code: 'en', label: 'English' },
      { code: 'ar', label: 'العربية' },
    ],
  });
  useEffect(() => {
    let cancelled = false;
    fetchLoginBranding().then((b) => { if (!cancelled) setBranding(b); });
    return () => { cancelled = true; };
  }, []);

  // ── Language ─────────────────────────────────────────────────────────
  // Initial: localStorage → i18n.language → 'en'.
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(LS_LANG) : null;
    if (stored && stored !== i18n.language) {
      i18n.changeLanguage(stored);
    }
    // One-time cleanup: remember-me was removed in a later iteration; drop
    // its keys if they linger on returning users.
    try {
      localStorage.removeItem('elmahdi:login:remember');
      localStorage.removeItem('elmahdi:login:lastUser');
    } catch { /* ignore */ }
  }, [i18n]);

  // Apply <html dir> + lang attribute every time language changes so the
  // login page itself flips RTL/LTR without needing a full app reload.
  useEffect(() => {
    const lang = i18n.language || 'en';
    const isRtl = lang.startsWith('ar');
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [i18n.language]);

  const switchLang = (code) => {
    i18n.changeLanguage(code);
    try { localStorage.setItem(LS_LANG, code); } catch { /* ignore */ }
  };

  // ── Form state ───────────────────────────────────────────────────────
  const [usr, setUsr]   = useState('');
  const [pwd, setPwd]   = useState('');
  const [err, setErr]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [touched, setTouched] = useState({ usr: false, pwd: false });

  // Inline validation messages (only after the user blurred / submitted).
  const usrError = touched.usr && !isValidIdentifier(usr)
    ? t('login.emailInvalid', { defaultValue: 'Enter a valid email or username.' })
    : '';
  const pwdError = touched.pwd && !pwd
    ? t('login.passwordRequired', { defaultValue: 'Password is required.' })
    : '';
  const formValid = isValidIdentifier(usr) && pwd.length > 0;

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ usr: true, pwd: true });
    if (!formValid) return;
    setErr('');
    setLoading(true);
    try {
      try { await apiLogout(); } catch { /* ignore */ }
      await sleep(120);

      await login(usr.trim(), pwd);
      await sleep(220);
      let authState = await loadUser();
      if (
        (!authState?.user || authState?.homePath === '/login') &&
        authState?.reason !== 'guest' &&
        authState?.reason !== 'roles-unreadable'
      ) {
        await sleep(380);
        authState = await loadUser();
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
        setErr(authState.authError || 'Your role permissions could not be verified. Contact an administrator.');
      } else {
        setErr('Login failed: no workspace access is assigned to this account.');
      }
    } catch (e2) {
      setErr(getLoginErrorMessage(e2, t));
    } finally {
      setLoading(false);
    }
  };

  const currentLang = (i18n.language || 'en').split('-')[0];

  return (
    <div className="login-page" data-workspace="login">
      <div className="login-bg" aria-hidden="true">
        <div className="login-bg__grid" />
        <div className="login-bg__glow login-bg__glow--a" />
        <div className="login-bg__glow login-bg__glow--b" />
      </div>

      {/* Language switcher — top-right (top-left in RTL) */}
      <div className="login-lang-switcher" role="group" aria-label={t('login.language', { defaultValue: 'Language' })}>
        {branding.languages.map((l) => (
          <button
            key={l.code}
            type="button"
            className={`login-lang-switcher__btn${currentLang === l.code ? ' is-active' : ''}`}
            onClick={() => switchLang(l.code)}
            aria-pressed={currentLang === l.code}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="login-card login-card--glass">
        <div className="login-card__header">
          <img
            className="login-card__logo"
            src={branding.logo_url}
            alt={branding.company_name}
            onError={(e) => { e.currentTarget.src = '/logo.png'; }}
          />
          <h1 className="login-card__title">{branding.company_name}</h1>
          <p className="login-card__sub">
            {branding.tagline || t('login.subtitle', { defaultValue: 'Sign in to your workspace' })}
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className={`form-group${usrError ? ' form-group--error' : ''}`}>
            <label className="form-label" htmlFor="login-username">
              {t('login.username', { defaultValue: 'Email or username' })}
            </label>
            <input
              id="login-username"
              className="form-input"
              type="text"
              value={usr}
              onChange={(e) => setUsr(e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, usr: true }))}
              placeholder={t('login.usernamePlaceholder', { defaultValue: 'admin@example.com' })}
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              autoFocus
              required
            />
            {usrError && <p className="form-hint form-hint--error" role="alert">{usrError}</p>}
          </div>

          <div className={`form-group${pwdError ? ' form-group--error' : ''}`}>
            <label className="form-label" htmlFor="login-password">
              {t('login.password', { defaultValue: 'Password' })}
            </label>
            <div className="form-input-wrap">
              <input
                id="login-password"
                className="form-input form-input--with-action"
                type={showPwd ? 'text' : 'password'}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, pwd: true }))}
                placeholder={t('login.passwordPlaceholder', { defaultValue: '••••••••' })}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="form-input__action"
                onClick={() => setShowPwd((s) => !s)}
                aria-label={
                  showPwd
                    ? t('login.hidePassword', { defaultValue: 'Hide password' })
                    : t('login.showPassword', { defaultValue: 'Show password' })
                }
                aria-pressed={showPwd}
                tabIndex={0}
              >
                {showPwd ? <EyeOffPlaceholder size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
            {pwdError && <p className="form-hint form-hint--error" role="alert">{pwdError}</p>}
          </div>

          {err && <p className="login-error" role="alert">{err}</p>}

          <Btn
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={!formValid && (touched.usr || touched.pwd)}
            style={{ width: '100%' }}
          >
            {loading
              ? t('login.signingIn', { defaultValue: 'Signing in…' })
              : t('login.signIn', { defaultValue: 'Sign in' })}
          </Btn>
        </form>

        <p className="login-hint">{t('login.footer', { defaultValue: branding.company_name })}</p>
      </div>
    </div>
  );
}
