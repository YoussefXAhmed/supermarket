import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Spinner } from '../ui';

export default function ProtectedRoute({ children, require: requireRole = 'any' }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Spinner size={32} />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return children;
}
