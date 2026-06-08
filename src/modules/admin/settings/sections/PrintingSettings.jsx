/**
 * Printing — wraps Print Settings + shows the Elmahdi-installed Print
 * Format catalog (read-only) so the Administrator can see what's
 * registered.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, EmptyState, PageLoading, Table } from '../../../../components/ui';
import { LayoutSection } from '../../../../components/layout/page-layouts';
import GenericSection from './_GenericSection';
import { listPrintFormats, listLetterHeads } from '../../../../services/systemSettingsApi';

export default function PrintingSettings() {
  const { t } = useTranslation();
  const [formats, setFormats] = useState([]);
  const [letterHeads, setLetterHeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listPrintFormats().catch(() => []),
      listLetterHeads().catch(() => []),
    ]).then(([f, l]) => {
      setFormats(f);
      setLetterHeads(l);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <GenericSection section="printing"
        titleKey="settings.printing.title"
        descriptionKey="settings.printing.desc" />

      <LayoutSection variant="raised" title={t('settings.printing.letterHeads', { defaultValue: 'Letter Heads' })} style={{ marginTop: 16 }}>
        {loading ? <PageLoading size={20} /> : letterHeads.length === 0 ? (
          <EmptyState icon="🖨" title={t('settings.printing.noLetterHeads', { defaultValue: 'No letter heads' })} />
        ) : (
          <Table
            data={letterHeads}
            columns={[
              { key: 'name', label: t('settings.printing.name', { defaultValue: 'Name' }),
                render: (v) => <span className="mono">{v}</span> },
              { key: 'is_default', label: t('settings.printing.default', { defaultValue: 'Default' }),
                render: (v) => v ? <Badge color="green">✓</Badge> : '—' },
              { key: 'disabled', label: t('settings.printing.disabled', { defaultValue: 'Disabled' }),
                render: (v) => v ? <Badge color="red">Yes</Badge> : '—' },
            ]}
          />
        )}
      </LayoutSection>

      <LayoutSection variant="raised" title={t('settings.printing.printFormats', { defaultValue: 'Print Formats (Elmahdi-registered)' })} style={{ marginTop: 16 }}>
        {loading ? <PageLoading size={20} /> : formats.length === 0 ? (
          <EmptyState icon="📄" title={t('settings.printing.noFormats', { defaultValue: 'No formats registered' })} />
        ) : (
          <Table
            data={formats}
            columns={[
              { key: 'name', label: t('settings.printing.name', { defaultValue: 'Name' }),
                render: (v) => <span className="mono">{v}</span> },
              { key: 'doc_type', label: t('settings.printing.docType', { defaultValue: 'Doctype' }),
                render: (v) => <Badge color="default">{v}</Badge> },
              { key: 'standard', label: t('settings.printing.standard', { defaultValue: 'Standard' }),
                render: (v) => v === 'Yes' ? '✓' : '—' },
              { key: 'disabled', label: t('settings.printing.disabled', { defaultValue: 'Disabled' }),
                render: (v) => v ? <Badge color="red">Yes</Badge> : '—' },
            ]}
          />
        )}
      </LayoutSection>
    </>
  );
}
