import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import DashboardPage from './DashboardPage';

/** Role-aware admin index — accountants land on finance workspace. */
export default function AdminHomePage() {
  const { capabilities } = useAuth();
  if (
    capabilities.operationalPersona === 'accountant' &&
    !capabilities.canManageSystem
  ) {
    return <Navigate to="/admin/accounting" replace />;
  }
  return <DashboardPage />;
}
