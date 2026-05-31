/**
 * Observability — Sentry-compatible error reporting.
 *
 * Works with either hosted Sentry or self-hosted GlitchTip (both speak the
 * Sentry protocol). Init is environment-gated: if VITE_SENTRY_DSN is not
 * set, every export here is a no-op — zero network traffic, zero overhead
 * in dev. Production builds with a DSN get full capture + breadcrumbs +
 * user identity binding.
 *
 * Wiring:
 *   - boot:            initObservability()           — main.jsx
 *   - error boundary:  captureException(e, info)     — ErrorBoundary.componentDidCatch
 *   - axios:           captureException(err)         — api.js response interceptor
 *   - auth lifecycle:  setObservabilityUser({...})   — AuthContext (login/logout)
 *
 * What we DON'T send to Sentry:
 *   - 401 / 403 — those are expected auth flows, not errors
 *   - aborted requests (AbortController)
 *   - probes with `silentAuthProbe`/`silentApi`
 */
import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN || '';
const ENVIRONMENT = import.meta.env.VITE_SENTRY_ENV || import.meta.env.MODE || 'development';
const RELEASE = import.meta.env.VITE_SENTRY_RELEASE || undefined;

let initialized = false;

export function initObservability() {
  if (initialized) return;
  if (!DSN) {
    // Dev / unconfigured environments — leave noisy, but on the console only.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info('[observability] no VITE_SENTRY_DSN — error capture disabled');
    }
    return;
  }
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    // Tracing / replay are off by default — they add bundle weight and a
    // serious data-collection footprint that should be a deliberate opt-in.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    // Filter out noise the user cannot do anything about.
    beforeSend(event, hint) {
      const err = hint?.originalException;
      const status = err?.response?.status || err?.status;
      // Suppress expected auth flows.
      if (status === 401 || status === 403) return null;
      // Suppress aborted requests (filter switches, navigation, etc.)
      const msg = String(err?.message || event?.message || '');
      if (/AbortError|cancelled|aborted/i.test(msg)) return null;
      // Suppress endpoints that opt out (silent probes).
      if (err?.config?.silentAuthProbe || err?.config?.silentApi) return null;
      return event;
    },
  });
  initialized = true;
}

/**
 * Capture an exception with optional context tags.
 * @param {unknown} error
 * @param {object} [context]
 * @param {string} [context.layer]      — 'api' | 'boundary' | 'pos' | 'report' | ...
 * @param {object} [context.tags]       — flat string-keyed tags
 * @param {object} [context.extra]      — arbitrary serializable data
 * @param {string} [context.componentStack] — React component stack
 */
export function captureException(error, context = {}) {
  if (!initialized || !error) return;
  Sentry.withScope((scope) => {
    if (context.layer) scope.setTag('layer', context.layer);
    if (context.tags) {
      for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, String(v));
    }
    if (context.extra) {
      for (const [k, v] of Object.entries(context.extra)) scope.setExtra(k, v);
    }
    if (context.componentStack) {
      scope.setExtra('componentStack', context.componentStack);
    }
    Sentry.captureException(error);
  });
}

/**
 * Capture a non-error event (e.g., "POS sale failed gracefully").
 * Useful for things we want visibility on but that didn't throw.
 */
export function captureMessage(message, level = 'warning', context = {}) {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context.layer) scope.setTag('layer', context.layer);
    if (context.tags) for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, String(v));
    if (context.extra) for (const [k, v] of Object.entries(context.extra)) scope.setExtra(k, v);
    Sentry.captureMessage(message, level);
  });
}

/**
 * Bind the current authenticated user to the observability scope.
 * Pass `null` on logout to clear.
 */
export function setObservabilityUser(user) {
  if (!initialized) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  // Send the minimum — no PII unless explicitly needed for debugging.
  Sentry.setUser({
    id: user.id || user.name || user.email || 'unknown',
    username: user.username || user.full_name || undefined,
    // email intentionally omitted unless sendDefaultPii is enabled
  });
}

/**
 * Add a breadcrumb — a low-importance event that gives context to the next
 * exception (e.g., "user navigated to /pos", "report 'sales-register' loaded").
 */
export function addBreadcrumb({ category, message, data, level = 'info' }) {
  if (!initialized) return;
  Sentry.addBreadcrumb({ category, message, data, level });
}

/** True if Sentry init succeeded — useful for conditional UI ("Report this error"). */
export function isObservabilityEnabled() {
  return initialized;
}
