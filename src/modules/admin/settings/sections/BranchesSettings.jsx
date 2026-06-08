/**
 * Branches — deep-link only. Real branch CRUD lives at /admin/warehouses
 * (existing AdminWarehousesPage). The User Permission mapping lives in
 * /admin/users. We don't duplicate UI.
 */
import { useTranslation } from 'react-i18next';
import AccessibleLink from '../../../../components/auth/AccessibleLink';
import { LayoutSection } from '../../../../components/layout/page-layouts';
import SettingsAuditLog from '../components/SettingsAuditLog';

export default function BranchesSettings() {
  const { t } = useTranslation();
  return (
    <>
      <LayoutSection variant="raised" title={t('settings.branches.title', { defaultValue: 'Branches' })}>
        <p style={{ margin: '0 0 12px', color: 'var(--text-2)' }}>
          {t('settings.branches.desc', {
            defaultValue: 'Branches are managed as Warehouses (is_group=0). User Permission rows scope users to their branch.',
          })}
        </p>
        <div className="accountant-links">
          <AccessibleLink to="/admin/warehouses" className="accountant-links__card">
            <span className="accountant-links__icon">🏪</span>
            <span className="accountant-links__label">{t('settings.branches.manage', { defaultValue: 'Manage Branches' })}</span>
            <span className="accountant-links__desc">{t('settings.branches.manageDesc', { defaultValue: 'Create, edit, disable branches' })}</span>
          </AccessibleLink>
          <AccessibleLink to="/admin/users" className="accountant-links__card">
            <span className="accountant-links__icon">👥</span>
            <span className="accountant-links__label">{t('settings.branches.userPerm', { defaultValue: 'Branch ↔ User scoping' })}</span>
            <span className="accountant-links__desc">{t('settings.branches.userPermDesc', { defaultValue: 'Drives Store Manager row-scoping' })}</span>
          </AccessibleLink>
        </div>
      </LayoutSection>
      <SettingsAuditLog section="branches" />
    </>
  );
}
