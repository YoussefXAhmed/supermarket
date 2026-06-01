import { UserAvatar } from '../ui';
import LanguageSwitcher from '../common/LanguageSwitcher';
import NotificationBell from '../notifications/NotificationBell';
import { useTranslation } from 'react-i18next';

export default function UserSessionActions({
  user,
  onLogout,
  links = [],
  compact = false,
}) {
  const { t } = useTranslation();
  const name = user?.full_name || user?.name || 'User';

  return (
    <div className={`session-actions ${compact ? 'session-actions--compact' : ''}`}>
      <span className="session-actions__identity">
        <UserAvatar user={user} size={compact ? 'sm' : 'md'} className="session-actions__avatar" />
        <span className="session-actions__name">{name}</span>
      </span>

      <div className="session-actions__buttons">
        <NotificationBell />
        <LanguageSwitcher className="session-actions__language" />
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
          {t('common.logout')}
        </button>
      </div>
    </div>
  );
}
