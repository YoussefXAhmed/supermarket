import { Navigate } from 'react-router-dom';
import { useInventoryCapabilities } from '../../hooks/useInventoryCapabilities';

/**
 * Secondary guard inside /inventory — denies route when capability is false.
 * ERPNext must still enforce submit permissions on the API.
 */
export default function InventoryCapabilityRoute({
  cap,
  children,
  fallback = '/inventory',
}) {
  const caps = useInventoryCapabilities();

  if (!caps[cap]) {
    return <Navigate to={fallback} replace />;
  }

  return children;
}
