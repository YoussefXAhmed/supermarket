import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Spinner } from '../ui';

export default function ProtectedRoute({ children, require: requireRole = 'any' }) {
  const { user, loading, isAdmin, isPOS, isInventory, homePath } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Spinner size={32} />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requireRole === 'admin' && !isAdmin) {
    return <Navigate to={homePath || '/login'} replace />;
  }

  if (requireRole === 'pos' && isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (requireRole === 'pos' && !isPOS) {
    return <Navigate to={homePath || '/login'} replace />;
  }

  if (requireRole === 'inventory' && !isAdmin && !isInventory) {
    return <Navigate to={homePath || '/login'} replace />;
  }

  return children;
}
