import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { canAccessPath } from '../../auth/routeAccess';

/**
 * Renders a router Link only when the target path passes canAccessPath().
 * Defense-in-depth — route guards remain authoritative.
 */
export default function AccessibleLink({ to, children, fallback = null, ...rest }) {
  const { capabilities } = useAuth();
  const target = typeof to === 'string' ? to : to?.pathname || '';

  if (!target || !canAccessPath(target, capabilities)) {
    return fallback;
  }

  return (
    <Link to={to} {...rest}>
      {children}
    </Link>
  );
}
