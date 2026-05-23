import { Navigate, useLocation } from 'react-router-dom';

/** Preserves path suffix when migrating legacy workspace prefixes. */
export default function LegacyPrefixRedirect({ from, to }) {
  const { pathname, search, hash } = useLocation();
  if (!pathname.startsWith(from)) {
    return <Navigate to={to} replace />;
  }
  const suffix = pathname.slice(from.length);
  return <Navigate to={`${to}${suffix}${search}${hash}`} replace />;
}
