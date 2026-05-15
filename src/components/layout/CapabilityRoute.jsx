import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';

/**
 * Route guard — requires an explicit capability flag from deriveCapabilities().
 */
export default function CapabilityRoute({ cap, children, fallback }) {
  const { capabilities, homePath } = useAuth();

  if (!hasCapability(capabilities, cap)) {
    return <Navigate to={fallback || homePath || '/login'} replace />;
  }

  return children;
}
