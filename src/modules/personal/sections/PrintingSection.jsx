import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Btn, FormField, Input, PageLoading } from '../../../components/ui';
import FormGrid from '../../../components/ui/FormGrid';
import { LayoutSection } from '../../../components/layout/page-layouts';
import { useNotify } from '../../../context/NotificationContext';
import { getPrinting, updatePrinting } from '../../../services/personalSettingsApi';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

const AUTO_PRINT_OPTIONS = [
  { value: 'Use POS Profile', labelKey: 'personal.printing.autoUseProfile', defaultLabel: 'Use POS Profile' },
  { value: 'Always',          labelKey: 'personal.printing.autoAlways',     defaultLabel: 'Always print' },
  { value: 'Never',           labelKey: 'personal.printing.autoNever',      defaultLabel: 'Never print' },
];

export default function PrintingSection() {
  const { t } = useTranslation();
  const notify = useNotify();
  const [values, setValues] = useState({ elmahdi_default_printer: '', elmahdi_auto_print_override: 'Use POS Profile' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getPrinting();
      setValues(d);
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const save = async (next) => {
    setSaving(true);
    setValues(next);
    try {
      await updatePrinting(next);
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LayoutSection variant="raised" title={t('personal.printing.title', { defaultValue: 'Printing' })}><PageLoading size={22} /></LayoutSection>;

  return (
    <LayoutSection variant="raised" title={t('personal.printing.title', { defaultValue: 'Printing' })}>
      <p className="personal-section__intro">
        {t('personal.printing.desc', { defaultValue: 'Override the POS Profile defaults for your own receipts and prints.' })}
      </p>

      <FormGrid cols="auto">
        <FormField
          label={t('personal.printing.printer', { defaultValue: 'Default printer name' })}
          hint={t('personal.printing.printerHelp', { defaultValue: 'Optional — points to a Network Printer Settings record.' })}
        >
          {({ id }) => (
            <Input id={id} type="text" className="mono"
              value={values.elmahdi_default_printer || ''}
              placeholder="Network Printer Settings name"
              onChange={(e) => setValues({ ...values, elmahdi_default_printer: e.target.value })}
              onBlur={() => save(values)}
              disabled={saving} />
          )}
        </FormField>

        <FormField label={t('personal.printing.autoTitle', { defaultValue: 'Auto-print receipts' })}>
          <div className="auto-print-options">
            {AUTO_PRINT_OPTIONS.map((opt) => (
              <Btn key={opt.value}
                variant={values.elmahdi_auto_print_override === opt.value ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => save({ ...values, elmahdi_auto_print_override: opt.value })}
                disabled={saving}>
                {t(opt.labelKey, { defaultValue: opt.defaultLabel })}
              </Btn>
            ))}
          </div>
        </FormField>
      </FormGrid>
    </LayoutSection>
  );
}
