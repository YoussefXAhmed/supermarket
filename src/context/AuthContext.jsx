import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getCurrentUser, getUserRoles, logout as apiLogout } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [roles, setRoles]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState({ isAdmin: false, isPOS: false });

  const loadUser = useCallback(async () => {
    try {
      const res  = await getCurrentUser();
      const name = res.data.message;
      if (!name || name === 'Guest') {
        setUser(null);
        setRoles([]);
        setCapabilities({ isAdmin: false, isPOS: false });
        return { user: null, roles: [], isAdmin: false, isPOS: false, reason: 'guest' };
      }

      try {
        const profile = await getUserRoles(name);
        const userData = profile.data.data;
        const roleList = (userData.roles || []).map(r => r.role);
        const isAdmin = roleList.includes('System Manager') || roleList.includes('Administrator');
        // Frontend does not enforce role policies; ERPNext remains source of truth.
        const isPOS = true;
        setUser(userData);
        setRoles(roleList);
        setCapabilities({ isAdmin, isPOS });
        return { user: userData, roles: roleList, isAdmin, isPOS, reason: null };
      } catch {
        // Some POS users cannot read User doctype details.
        // Keep session-based login and allow POS mode by default.
        const fallbackUser = { name, full_name: name, email: name };
        setUser(fallbackUser);
        setRoles([]);
        setCapabilities({ isAdmin: false, isPOS: true });
        return { user: fallbackUser, roles: [], isAdmin: false, isPOS: true, reason: 'roles-unreadable' };
      }
    } catch (e) {
      setUser(null);
      setRoles([]);
      setCapabilities({ isAdmin: false, isPOS: false });
      return { user: null, roles: [], isAdmin: false, isPOS: false, reason: e?.message || 'load-user-failed' };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const logout = async () => {
    try { await apiLogout(); } catch { /* ignore */ }
    setUser(null);
    setRoles([]);
    setCapabilities({ isAdmin: false, isPOS: false });
  };

  const isAdmin = capabilities.isAdmin;
  const isPOS = capabilities.isPOS;

  return (
    <AuthContext.Provider value={{ user, roles, loading, loadUser, logout, isAdmin, isPOS }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
