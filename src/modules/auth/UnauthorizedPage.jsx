import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Btn, RoleBadge } from '../../components/ui';

/**
 * Standalone unauthorized view — no workspace layout/sidebar.
 */
export default function UnauthorizedPage({ homePath = '/login', reason = 'route' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const messageKey = reason === 'workspace'
    ? 'auth.unauthorized.workspaceMessage'
    : 'auth.unauthorized.routeMessage';

  return (
    <div className="unauthorized-page">
      <div className="unauthorized-page__card">
        <RoleBadge />
        <h1 className="unauthorized-page__title">{t('auth.unauthorized.title')}</h1>
        <p className="unauthorized-page__message">{t(messageKey)}</p>
        <div className="unauthorized-page__actions">
          <Btn variant="primary" size="md" onClick={() => navigate(homePath, { replace: true })}>
            {t('auth.unauthorized.goHome')}
          </Btn>
          <Btn variant="ghost" size="md" onClick={() => navigate(-1)}>
            {t('auth.unauthorized.goBack')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
