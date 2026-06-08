/**
 * Users & Roles — deep-link to /admin/users + read-only capability
 * matrix viewer (closes the Phase 1 gap).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AccessibleLink from '../../../../components/auth/AccessibleLink';
import { Badge, EmptyState, PageLoading } from '../../../../components/ui';
import { LayoutSection } from '../../../../components/layout/page-layouts';
import { getCapabilityMatrix } from '../../../../services/systemSettingsApi';
import SettingsAuditLog from '../components/SettingsAuditLog';

export default function UsersRolesSettings() {
  const { t } = useTranslation();
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCapabilityMatrix()
      .then(setMatrix)
      .catch(() => setMatrix(null))
      .finally(() => setLoading(false));
  }, []);

  const caps = matrix?.caps_by_profile || {};
  const profiles = Object.keys(caps);
  const allCapNames = new Set();
  profiles.forEach((p) => Object.keys(caps[p] || {}).forEach((c) => allCapNames.add(c)));
  const capList = Array.from(allCapNames).sort();

  return (
    <>
      <LayoutSection variant="raised" title={t('settings.usersRoles.title', { defaultValue: 'Users & Roles' })}>
        <p style={{ margin: '0 0 12px', color: 'var(--text-2)' }}>
          {t('settings.usersRoles.desc', {
            defaultValue: 'User CRUD lives on the dedicated users page. The capability matrix below is read-only and reflects the current backend mirror.',
          })}
        </p>
        <div className="accountant-links">
          <AccessibleLink to="/admin/users" className="accountant-links__card">
            <span className="accountant-links__icon">👥</span>
            <span className="accountant-links__label">{t('settings.usersRoles.manageUsers', { defaultValue: 'Manage Users' })}</span>
            <span className="accountant-links__desc">{t('settings.usersRoles.manageUsersDesc', { defaultValue: 'Provisioning, role profiles, disable' })}</span>
          </AccessibleLink>
        </div>
      </LayoutSection>

      <LayoutSection variant="raised"
        title={t('settings.usersRoles.matrixTitle', { defaultValue: 'Capability matrix (read-only)' })}
        style={{ marginTop: 16 }}>
        <p style={{ margin: '0 0 12px', color: 'var(--text-3)', fontSize: '0.86rem' }}>
          {t('settings.usersRoles.matrixDesc', {
            defaultValue: 'Each row is a capability. Each column is a role profile. ✓ means the profile holds the capability.',
          })}
        </p>
        {loading ? <PageLoading size={20} /> : !profiles.length ? (
          <EmptyState icon="🔐" title={t('settings.usersRoles.matrixEmpty', { defaultValue: 'No capability data available' })} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table table--compact" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'var(--bg-2)' }}>{t('settings.usersRoles.capability', { defaultValue: 'Capability' })}</th>
                  {profiles.map((p) => <th key={p}>{p.replace(/^Elmahdi /, '')}</th>)}
                </tr>
              </thead>
              <tbody>
                {capList.map((cap) => (
                  <tr key={cap}>
                    <td className="mono" style={{ fontSize: '0.78rem', position: 'sticky', left: 0, background: 'var(--bg-2)' }}>{cap}</td>
                    {profiles.map((p) => (
                      <td key={p} style={{ textAlign: 'center' }}>
                        {caps[p]?.[cap] ? <Badge color="green">✓</Badge> : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LayoutSection>

      <SettingsAuditLog section="users-roles" />
    </>
  );
}
