/**
 * /hr/settings — HR workspace settings (HR Settings subset + catalog
 * counts with deep-links).
 *
 * Eligible roles: HR Officer + Administrator (`canManageHRSettings`).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AccessibleLink from '../../components/auth/AccessibleLink';
import { LayoutSection } from '../../components/layout/page-layouts';
import { Badge } from '../../components/ui';
import WorkspaceSettingsPage from '../admin/settings/components/WorkspaceSettingsPage';
import { listHrCatalogs } from '../../services/workspaceSettingsApi';
import { getERPDeskUrl } from '../../utils/erpLinks';

export default function HrSettingsPage() {
  const { t } = useTranslation();
  const [catalogs, setCatalogs] = useState(null);

  useEffect(() => {
    listHrCatalogs().then(setCatalogs).catch(() => setCatalogs(null));
  }, []);

  const linkRow = (label, count, deskPath) => (
    <li key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {count === null ? <Badge color="default">—</Badge>
          : <Badge color="blue">{count} {t('settings.hr.entries', { defaultValue: 'entries' })}</Badge>}
        <a href={getERPDeskUrl(deskPath)} target="_blank" rel="noreferrer" className="btn btn--ghost btn--sm">
          {t('settings.hr.openInDesk', { defaultValue: 'Open in Desk ↗' })}
        </a>
      </span>
    </li>
  );

  return (
    <WorkspaceSettingsPage
      workspace="hr"
      titleKey="settings.hr.workspaceTitle"
      descriptionKey="settings.hr.workspaceDesc"
      renderExtras={() => (
        <LayoutSection variant="flat"
          title={t('settings.hr.catalogTitle', { defaultValue: 'HR catalogs' })}
          style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', color: 'var(--text-2)', fontSize: '0.86rem' }}>
            {t('settings.hr.catalogDesc', {
              defaultValue: 'Leave types, holiday lists, salary components and structures are seeded by the Elmahdi installer. Edit them in Desk.',
            })}
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {linkRow(t('settings.hr.leaveTypes', { defaultValue: 'Leave Types' }), catalogs?.['Leave Type'] ?? null, '/leave-type')}
            {linkRow(t('settings.hr.holidayList', { defaultValue: 'Holiday Lists' }), catalogs?.['Holiday List'] ?? null, '/holiday-list')}
            {linkRow(t('settings.hr.salaryComponents', { defaultValue: 'Salary Components' }), catalogs?.['Salary Component'] ?? null, '/salary-component')}
            {linkRow(t('settings.hr.salaryStructures', { defaultValue: 'Salary Structures' }), catalogs?.['Salary Structure'] ?? null, '/salary-structure')}
          </ul>
        </LayoutSection>
      )}
    />
  );
}
