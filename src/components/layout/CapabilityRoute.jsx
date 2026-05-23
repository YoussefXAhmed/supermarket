import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';
import UnauthorizedPage from '../../modules/auth/UnauthorizedPage';

/**
 * Inner route guard — requires an explicit capability flag from deriveCapabilities().
 */
export default function CapabilityRoute({ cap, anyOf, children, fallback, homePath: homePathProp }) {
  const { capabilities, homePath } = useAuth();
  const required = anyOf?.length ? anyOf : cap ? [cap] : [];

  if (!required.some((c) => hasCapability(capabilities, c))) {
    return (
      <UnauthorizedPage
        homePath={fallback || homePathProp || homePath || '/login'}
        reason="route"
      />
    );
  }

  return children;
}
