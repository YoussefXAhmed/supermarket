/**
 * Shared body for any "wraps existing Frappe Singles" section.
 *
 * Used by Products / Pricing / Inventory / Finance / Notifications /
 * Printing / Security — all of which just need to render the dispatcher
 * blocks + a save button + audit log.
 */
import { useTranslation } from 'react-i18next';
import SectionForm from '../components/SectionForm';
import SectionBlock from '../components/SectionBlock';
import SettingsAuditLog from '../components/SettingsAuditLog';
import { getSection, updateSection } from '../../../../services/systemSettingsApi';

export default function GenericSection({ section, titleKey, descriptionKey }) {
  const { t } = useTranslation();
  return (
    <>
      <SectionForm
        section={section}
        title={t(titleKey, { defaultValue: section })}
        description={descriptionKey ? t(descriptionKey, { defaultValue: '' }) : null}
        loader={() => getSection(section)}
        onSave={(payload) => updateSection(section, payload)}
      >
        {({ values, setField, data }) => (
          <>
            {(data?.blocks || []).map((block) => (
              <SectionBlock
                key={block.doctype}
                block={block}
                values={values}
                setField={setField}
              />
            ))}
          </>
        )}
      </SectionForm>
      <SettingsAuditLog section={section} />
    </>
  );
}
