/**
 * Public branding feed for the login screen — runs BEFORE auth.
 *
 * The backend endpoint is `allow_guest=True` so this fetch works without
 * a session. We keep the failure mode silent: if the API is down, the
 * page falls back to the hard-coded company name and shipped logo.
 */
import api from './api';

const ENDPOINT = '/api/method/elmahdi.api.branding.get_login_branding';

const FALLBACK = {
  company_name: 'Elmahdi Supermarket',
  logo_url: '/logo.png',
  tagline: '',
  languages: [
    { code: 'en', label: 'English' },
    { code: 'ar', label: 'العربية' },
  ],
};

export async function fetchLoginBranding() {
  try {
    const res = await api.get(ENDPOINT);
    const data = res?.data?.message;
    if (!data || typeof data !== 'object') return FALLBACK;
    return { ...FALLBACK, ...data };
  } catch {
    // Network / 403 / 500 — fall back to baked-in branding so the user
    // can always log in.
    return FALLBACK;
  }
}
