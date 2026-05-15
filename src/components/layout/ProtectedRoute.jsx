import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';
import { Spinner } from '../ui';

const REQUIRE_CAP = {
  admin: 'canAccessAdminWorkspace',
  'admin-system': 'canManageSystem',
  pos: 'canViewPOS',
  inventory: 'canAccessInventory',
  purchasing: 'canAccessPurchasing',
};

export default function ProtectedRoute({ children, require: requireRole = 'any' }) {
  const { user, loading, capabilities, homePath } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Spinner size={32} />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requireRole === 'any') return children;

  const cap = REQUIRE_CAP[requireRole];
  if (cap && !hasCapability(capabilities, cap)) {
    return <Navigate to={homePath || '/login'} replace />;
  }

  return children;
}
