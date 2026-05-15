import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getCurrentUser, getUserRoles, logout as apiLogout } from '../services/api';

const AuthContext = createContext(null);
const ADMIN_ROLES = new Set(['System Manager', 'Administrator']);
const POS_ROLES = new Set([
  'pos user',
  'pos manager',
  'sales user',
  'sales manager',
  'cashier',
  // Some deployments expose cashier users via website/profile manager style roles.
  'profile manager',
  'website manager',
]);
const INVENTORY_ROLES = new Set(['stock user', 'stock manager', 'item manager', 'warehouse user', 'warehouse manager']);
const MANAGER_ROLES = new Set(['pos manager', 'sales manager', 'stock manager', 'warehouse manager', 'purchase manager']);

function devAuthLog(...args) {
  if (import.meta.env.DEV) console.info(...args);
}
function devAuthWarn(...args) {
  if (import.meta.env.DEV) console.warn(...args);
}

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function deriveCapabilities(roleList = [], roleProfileName = '') {
  const normalized = roleList.map(normalizeRole).filter(Boolean);
  const profile = normalizeRole(roleProfileName);

  const isAdmin = roleList.some((r) => ADMIN_ROLES.has(r));
  const isPOS =
    normalized.some((r) => POS_ROLES.has(r)) ||
    profile.includes('pos') ||
    profile.includes('cashier');
  const isInventory =
    normalized.some((r) => INVENTORY_ROLES.has(r)) ||
    profile.includes('stock') ||
    profile.includes('inventory') ||
    profile.includes('warehouse');
  const isManager =
    normalized.some((r) => MANAGER_ROLES.has(r) || r.includes('manager')) ||
    profile.includes('manager');
  const roleLabel = roleList.find((r) => ADMIN_ROLES.has(r) || POS_ROLES.has(normalizeRole(r)) || INVENTORY_ROLES.has(normalizeRole(r)))
    || roleProfileName
    || roleList[0]
    || '';
  return { isAdmin, isPOS, isInventory, isManager, roleLabel };
}

function homePathFromRoles(roleList = [], roleProfileName = '') {
  const { isAdmin, isPOS, isInventory } = deriveCapabilities(roleList, roleProfileName);
  if (isAdmin) return '/admin';
  if (isPOS) return '/pos';
  if (isInventory) return '/inventory';
  return '/login';
}

function homePathFromIdentifier(identifier = '') {
  const id = normalizeRole(identifier);
  if (!id) return '/login';
  if (id.includes('admin') || id.includes('administrator') || id.includes('system')) return '/admin';
  if (id.includes('cashier') || id.includes('pos') || id.includes('sales')) return '/pos';
  if (id.includes('stock') || id.includes('inventory') || id.includes('warehouse')) return '/inventory';
  return '/login';
}

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [roles, setRoles]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState({
    isAdmin: false, isPOS: false, isInventory: false, isManager: false, roleLabel: '',
  });

  const loadUser = useCallback(async () => {
    try {
      const res  = await getCurrentUser();
      const name = res.data.message;
      if (!name || name === 'Guest') {
        setUser(null);
        setRoles([]);
        setCapabilities({ isAdmin: false, isPOS: false, isInventory: false, isManager: false, roleLabel: '' });
        return { user: null, roles: [], isAdmin: false, isPOS: false, isInventory: false, isManager: false, roleLabel: '', homePath: '/login', reason: 'guest' };
      }

      try {
        const profile = await getUserRoles(name);
        const userData = profile.data.data;
        const roleList = (userData.roles || [])
          .map((r) => (typeof r === 'string' ? r : r?.role))
          .filter(Boolean);
        const roleProfileName = userData.role_profile_name || '';

        // Some ERP setups return User doc without roles for non-admin readers.
        // In this case, fall through to boot/session fallback logic below.
        if (roleList.length === 0) {
          throw new Error('roles-empty-from-user-doctype');
        }

        const caps = deriveCapabilities(roleList, roleProfileName);
        const homePath = homePathFromRoles(roleList, roleProfileName);
        devAuthLog('[auth] roles resolved', { user: name, roles: roleList, homePath });
        setUser(userData);
        setRoles(roleList);
        setCapabilities(caps);
        return { user: userData, roles: roleList, ...caps, homePath, reason: null };
      } catch (e) {
        devAuthWarn('[auth] failed to fetch roles', { user: name, error: e?.message });

        // Final fallback when role APIs are restricted: infer landing path from user identifier.
        const inferredPath = homePathFromIdentifier(name);
        const inferredCaps = {
          isAdmin: inferredPath === '/admin',
          isPOS: inferredPath === '/pos',
          isInventory: inferredPath === '/inventory',
          isManager: false,
          roleLabel: name,
        };
        const fallbackUser = { name, full_name: name, email: name };
        setUser(fallbackUser);
        setRoles([]);
        setCapabilities(inferredCaps);
        devAuthLog('[auth] inferred fallback', { user: name, inferredPath });
        return {
          user: fallbackUser,
          roles: [],
          ...inferredCaps,
          homePath: inferredPath,
          reason: inferredPath === '/login' ? 'roles-unreadable' : 'identifier-inferred',
        };
      }
    } catch (e) {
      setUser(null);
      setRoles([]);
      setCapabilities({ isAdmin: false, isPOS: false, isInventory: false, isManager: false, roleLabel: '' });
      return { user: null, roles: [], isAdmin: false, isPOS: false, isInventory: false, isManager: false, roleLabel: '', homePath: '/login', reason: e?.message || 'load-user-failed' };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const logout = async () => {
    try { await apiLogout(); } catch { /* ignore */ }
    setUser(null);
    setRoles([]);
    setCapabilities({ isAdmin: false, isPOS: false, isInventory: false, isManager: false, roleLabel: '' });
  };

  const { isAdmin, isPOS, isInventory, isManager, roleLabel } = capabilities;
  const homePath = homePathFromRoles(roles, user?.role_profile_name || '');

  return (
    <AuthContext.Provider value={{ user, roles, loading, loadUser, logout, isAdmin, isPOS, isInventory, isManager, roleLabel, homePath }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
