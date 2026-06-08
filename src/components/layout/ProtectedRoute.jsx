import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';
import { canAccessPath } from '../../auth/routeAccess';
import UnauthorizedPage from '../../modules/auth/UnauthorizedPage';
import { Spinner } from '../ui';

const REQUIRE_CAP = {
  admin: 'canManageSystem',
  'admin-system': 'canManageSystem',
  manager: 'canAccessManagerWorkspace',
  // Read-only GL access also unlocks the /finance scope (the route's own
  // CapabilityRoute still gates each page; Store Manager only reaches the
  // GL page itself, not payments / matching / invoices).
  finance: ['canAccessAccountantWorkspace', 'canViewGLReadOnly'],
  hr: 'canAccessHRWorkspace',
  pos: 'canViewPOS',
  inventory: 'canAccessInventory',
  purchasing: 'canAccessPurchasing',
};

const SHIFT_CAPS = [
  'canOpenShift',
  'canCloseShift',
  'canViewShiftReports',
  'canViewOwnShiftHistory',
];

function AuthLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Spinner size={32} />
    </div>
  );
}

/**
 * Synchronous workspace + path guard. Layout shells must not render before this passes.
 */
export default function ProtectedRoute({
  children,
  require: requireRole = 'any',
  checkPath = true,
}) {
  const { user, loading, capabilities, homePath } = useAuth();
  const { pathname } = useLocation();

  if (loading) return <AuthLoading />;

  if (!user) return <Navigate to="/login" replace />;

  if (requireRole === 'shifts') {
    const shiftOk = SHIFT_CAPS.some((cap) => hasCapability(capabilities, cap));
    if (!shiftOk) {
      return <UnauthorizedPage homePath={homePath || '/login'} reason="workspace" />;
    }
  } else if (requireRole !== 'any') {
    const cap = REQUIRE_CAP[requireRole];
    if (cap) {
      // `cap` may be a string (single required cap) or an array of
      // alternative caps — anyOf. The latter lets cross-workspace
      // read-only visitors (e.g. Store Manager reading GL) reach the
      // workspace without needing the full operating cap.
      const ok = Array.isArray(cap)
        ? cap.some((c) => hasCapability(capabilities, c))
        : hasCapability(capabilities, cap);
      if (!ok) {
        return <UnauthorizedPage homePath={homePath || '/login'} reason="workspace" />;
      }
    }
  }

  if (checkPath && !canAccessPath(pathname, capabilities)) {
    return <UnauthorizedPage homePath={homePath || '/login'} reason="route" />;
  }

  return children;
}
