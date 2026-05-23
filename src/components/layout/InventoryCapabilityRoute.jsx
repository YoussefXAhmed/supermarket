import { useAuth } from '../../hooks/useAuth';
import { useInventoryCapabilities } from '../../hooks/useInventoryCapabilities';
import UnauthorizedPage from '../../modules/auth/UnauthorizedPage';

/**
 * Secondary guard inside /inventory — denies route when capability is false.
 */
export default function InventoryCapabilityRoute({
  cap,
  children,
  fallback = '/inventory',
}) {
  const { homePath } = useAuth();
  const caps = useInventoryCapabilities();

  if (!caps[cap]) {
    return (
      <UnauthorizedPage
        homePath={fallback || homePath || '/inventory'}
        reason="route"
      />
    );
  }

  return children;
}
