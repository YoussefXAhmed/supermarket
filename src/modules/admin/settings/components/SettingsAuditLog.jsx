/**
 * Collapsible audit history for a settings section. Renders newest-first.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Btn, EmptyState, PageLoading, Table } from '../../../../components/ui';
import { LayoutSection } from '../../../../components/layout/page-layouts';
import { getAuditLog } from '../../../../services/systemSettingsApi';
import { fmtDateTime } from '../../../../utils/format';
import { getUserFriendlyMessage } from '../../../../utils/errorHandling';

export default function SettingsAuditLog({ section, defaultOpen = false }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!section) return;
    setLoading(true);
    setError('');
    try {
      const data = await getAuditLog({ section, limit: 50 });
      setRows(data);
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const columns = [
    { key: 'changed_at', label: t('settings.audit.when', { defaultValue: 'When' }),
      render: (v) => fmtDateTime(v) },
    { key: 'changed_by', label: t('settings.audit.who', { defaultValue: 'Who' }) },
    { key: 'source_doctype', label: t('settings.audit.source', { defaultValue: 'Source' }),
      render: (v) => <Badge color="default">{v}</Badge> },
    { key: 'setting_field', label: t('settings.audit.field', { defaultValue: 'Field' }),
      render: (v) => <span className="mono">{v}</span> },
    { key: 'previous_value', label: t('settings.audit.from', { defaultValue: 'From' }),
      render: (v) => <code style={{ background: 'var(--bg-3)', padding: '0 4px', borderRadius: 2 }}>{v || '∅'}</code> },
    { key: 'new_value', label: t('settings.audit.to', { defaultValue: 'To' }),
      render: (v) => <code style={{ background: 'var(--bg-3)', padding: '0 4px', borderRadius: 2 }}>{v || '∅'}</code> },
  ];

  return (
    <LayoutSection
      variant="flat"
      style={{ marginTop: 16 }}
      title={t('settings.audit.title', { defaultValue: 'Audit log' })}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>
          {t('settings.audit.help', {
            defaultValue: 'Every change in this section is recorded with who, what, prev, new, and timestamp.',
          })}
        </span>
        <Btn variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? t('settings.audit.hide', { defaultValue: 'Hide' })
                : t('settings.audit.show', { defaultValue: 'Show history' })}
        </Btn>
      </div>

      {open && (loading ? (
        <PageLoading size={20} />
      ) : error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="📜"
          title={t('settings.audit.empty', { defaultValue: 'No changes yet' })}
          desc={t('settings.audit.emptyDesc', { defaultValue: 'Changes will appear here once you edit a setting.' })}
        />
      ) : (
        <Table columns={columns} data={rows} />
      ))}
    </LayoutSection>
  );
}
