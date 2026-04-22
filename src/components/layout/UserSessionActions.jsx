export default function UserSessionActions({
  user,
  onLogout,
  links = [],
  compact = false,
}) {
  const name = user?.full_name || user?.name || 'User';
  const first = name?.[0]?.toUpperCase() || 'U';

  return (
    <div className={`session-actions ${compact ? 'session-actions--compact' : ''}`}>
      <span className="session-actions__identity">
        <span className="session-actions__avatar">{first}</span>
        <span className="session-actions__name">{name}</span>
      </span>

      <div className="session-actions__buttons">
        {links.map((link) => (
          <button
            key={link.label}
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={link.onClick}
          >
            {link.label}
          </button>
        ))}

        <button
          type="button"
          className="btn btn--danger btn--sm"
          onClick={onLogout}
        >
          Log out
        </button>
      </div>
    </div>
  );
}

