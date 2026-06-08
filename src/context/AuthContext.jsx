import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { probeLoggedInUser, logout as apiLogout, clearCsrfToken } from '../services/api';
import { setObservabilityUser } from '../services/observability';
import {
  canAccessPurchasing,
  homePathFromCapabilities,
  EMPTY_CAPABILITIES,
} from '../auth/capabilities';
import {
  AuthResolutionError,
  resolveUserAuthProfile,
} from '../services/authRoleResolution';

const AuthContext = createContext(null);

function devAuthLog(...args) {
  if (import.meta.env.DEV) console.info(...args);
}
function devAuthWarn(...args) {
  if (import.meta.env.DEV) console.warn(...args);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState(EMPTY_CAPABILITIES);

  const loadUser = useCallback(async () => {
    try {
      const name = await probeLoggedInUser();
      if (!name) {
        setUser(null);
        setRoles([]);
        setCapabilities(EMPTY_CAPABILITIES);
        return {
          user: null,
          roles: [],
          capabilities: EMPTY_CAPABILITIES,
          ...EMPTY_CAPABILITIES,
          canAccessPurchasing: false,
          homePath: '/login',
          reason: 'guest',
        };
      }

      try {
        const resolved = await resolveUserAuthProfile(name);
        const { userData, roleList, caps, homePath, sources } = resolved;
        const purchasing = canAccessPurchasing(caps);
        devAuthLog('[auth] roles resolved', {
          user: name,
          roles: roleList,
          roleProfile: resolved.roleProfileName,
          homePath,
          sources,
          persona: caps.operationalPersona,
          canOperatePOS: caps.canOperatePOS,
          canViewPOS: caps.canViewPOS,
        });
        setUser(userData);
        setRoles(roleList);
        setCapabilities(caps);
        // Bind identity so any exception captured after this point is
        // attributed to the right user in the observability backend.
        setObservabilityUser({
          id: userData?.name || userData?.email,
          username: userData?.full_name,
        });
        return {
          user: userData,
          roles: roleList,
          capabilities: caps,
          ...caps,
          canAccessPurchasing: purchasing,
          homePath,
          reason: null,
        };
      } catch (e) {
        const isResolution = e instanceof AuthResolutionError;
        devAuthWarn('[auth] role resolution failed — fail closed', {
          user: name,
          code: isResolution ? e.code : 'unknown',
          error: e?.message,
        });
        setUser(null);
        setRoles([]);
        setCapabilities(EMPTY_CAPABILITIES);
        return {
          user: null,
          roles: [],
          capabilities: EMPTY_CAPABILITIES,
          ...EMPTY_CAPABILITIES,
          canAccessPurchasing: false,
          homePath: '/login',
          reason: 'roles-unreadable',
          authError: isResolution ? e.message : undefined,
        };
      }
    } catch (e) {
      setUser(null);
      setRoles([]);
      setCapabilities(EMPTY_CAPABILITIES);
      return {
        user: null,
        roles: [],
        capabilities: EMPTY_CAPABILITIES,
        ...EMPTY_CAPABILITIES,
        canAccessPurchasing: false,
        homePath: '/login',
        reason: e?.message || 'load-user-failed',
      };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Phase 5 — once authenticated, sync the user's saved language to
  // i18n + dir. Theme/accent/sidebar customizations were dropped per
  // user request — only language preference is restored.
  useEffect(() => {
    if (!user?.name || user.name === 'Guest') return;
    let cancelled = false;
    (async () => {
      try {
        const [{ getLanguage }, i18nMod] = await Promise.all([
          import('../services/personalSettingsApi'),
          import('../i18n'),
        ]);
        const language = await getLanguage().catch(() => null);
        if (cancelled) return;
        const lang = language?.language;
        if (lang && lang !== i18nMod.default?.language) {
          await i18nMod.default?.changeLanguage(lang);
          document.documentElement.lang = lang;
          document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
          try { localStorage.setItem('i18nextLng', lang); } catch { /* noop */ }
        }
      } catch { /* best-effort, never block auth */ }
    })();
    return () => { cancelled = true; };
  }, [user?.name]);

  const logout = async () => {
    try {
      await apiLogout();
    } catch {
      /* ignore */
    }
    // Drop the cached CSRF token so a subsequent re-login (potentially as a
    // different user) starts fresh and binds to the new session.
    clearCsrfToken();
    // Clear the observability user binding so post-logout errors aren't
    // attributed to the previous user.
    setObservabilityUser(null);
    setUser(null);
    setRoles([]);
    setCapabilities(EMPTY_CAPABILITIES);
  };

  const canAccessPurchasingFlag = useMemo(
    () => canAccessPurchasing(capabilities),
    [capabilities],
  );

  const homePath = homePathFromCapabilities(capabilities);

  const value = useMemo(
    () => ({
      user,
      roles,
      loading,
      loadUser,
      logout,
      capabilities,
      homePath,
      canAccessPurchasing: canAccessPurchasingFlag,
      ...capabilities,
    }),
    [user, roles, loading, loadUser, logout, capabilities, homePath, canAccessPurchasingFlag],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
