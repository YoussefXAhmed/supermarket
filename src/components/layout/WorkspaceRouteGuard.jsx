import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { canAccessPath, resolveHomePath } from '../../auth/routeAccess';

/**
 * Redirects authenticated users away from workspaces they cannot access (stale session / bookmark).
 */
export default function WorkspaceRouteGuard() {
  const { user, loading, capabilities } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const lastOk = useRef('');

  useEffect(() => {
    if (loading || !user) return;
    const path = location.pathname;
    if (path === '/login') return;

    const home = resolveHomePath(capabilities);
    if (!canAccessPath(path, capabilities)) {
      if (lastOk.current !== path) {
        navigate(home, { replace: true });
      }
      return;
    }
    lastOk.current = path;
  }, [loading, user, location.pathname, capabilities, navigate]);

  return null;
}
