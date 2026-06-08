/**
 * Standardised form wrapper for every settings section.
 *
 * Provides:
 *   • Loading state
 *   • Error state with retry
 *   • Save / Reset buttons (Save disabled when no diff)
 *   • Unsaved-changes warning when navigating away
 *   • Success toast via NotificationContext
 *
 * Usage:
 *   <SectionForm
 *     section="security"
 *     loader={() => getSection('security')}
 *     onSave={(payload) => updateSection('security', payload)}
 *     buildPayload={(values, initial) => { ... }}
 *   >
 *     {(values, setField) => <fields />}
 *   </SectionForm>
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiErrorCard, Btn, PageLoading } from '../../../../components/ui';
import { LayoutSection } from '../../../../components/layout/page-layouts';
import { useNotify } from '../../../../context/NotificationContext';
import { getUserFriendlyMessage } from '../../../../utils/errorHandling';

export default function SectionForm({
  section,
  title,
  description,
  loader,
  onSave,
  children,
  // Override to skip the section-level header (when caller renders its own).
  flushHead = false,
}) {
  const { t } = useTranslation();
  const notify = useNotify();
  const [data, setData] = useState(null);  // server snapshot
  const [values, setValues] = useState({}); // merged: snapshot ∪ user edits
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const fetched = await loader();
      setData(fetched);
      // Build a single flat value map per (doctype, field) -> value.
      const flat = {};
      (fetched?.blocks || []).forEach((b) => {
        Object.entries(b.values || {}).forEach(([f, v]) => {
          flat[`${b.doctype}::${f}`] = v;
        });
      });
      setValues(flat);
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => { load(); }, [load]);

  const initialFlat = useMemo(() => {
    if (!data) return {};
    const flat = {};
    (data.blocks || []).forEach((b) => {
      Object.entries(b.values || {}).forEach(([f, v]) => {
        flat[`${b.doctype}::${f}`] = v;
      });
    });
    return flat;
  }, [data]);

  const dirty = useMemo(() => {
    return Object.keys(values).some((k) => String(values[k] ?? '') !== String(initialFlat[k] ?? ''));
  }, [values, initialFlat]);

  // Warn on navigate-away with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const setField = useCallback((doctype, field, value) => {
    setValues((prev) => ({ ...prev, [`${doctype}::${field}`]: value }));
  }, []);

  const reset = () => setValues({ ...initialFlat });

  const save = async () => {
    setSaving(true);
    try {
      // Group only dirty values back to the {doctype: {field: value}} payload.
      const payload = {};
      Object.keys(values).forEach((k) => {
        const [doctype, field] = k.split('::');
        const v = values[k];
        if (String(v ?? '') !== String(initialFlat[k] ?? '')) {
          (payload[doctype] = payload[doctype] || {})[field] = v;
        }
      });
      const res = await onSave(payload);
      const appliedCount = (res?.applied || []).length;
      notify.success(t('settings.savedN', {
        defaultValue: 'Saved {{count}} setting(s).',
        count: appliedCount,
      }));
      // Re-fetch so the snapshot updates and `dirty` clears.
      await load();
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <LayoutSection
      variant="raised"
      title={!flushHead && title ? title : undefined}
      flushHead={flushHead}
    >
      {!flushHead && description && (
        <p style={{ margin: '0 0 12px', color: 'var(--text-2)', fontSize: '0.86rem' }}>
          {description}
        </p>
      )}

      {loading ? (
        <PageLoading size={22} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : (
        <>
          {children({ values, setField, data, dirty })}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" size="md" onClick={reset} disabled={!dirty || saving}>
              {t('settings.reset', { defaultValue: 'Reset' })}
            </Btn>
            <Btn variant="primary" size="md" onClick={save} disabled={!dirty || saving} loading={saving}>
              {t('settings.save', { defaultValue: 'Save changes' })}
            </Btn>
          </div>
        </>
      )}
    </LayoutSection>
  );
}
