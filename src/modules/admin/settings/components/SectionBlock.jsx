/**
 * Render one source-doctype block inside a section.
 *
 * Shows the doctype name as a sub-header (so the Administrator always
 * sees where the value actually lives — drives the "no duplicates"
 * principle into the UI) and renders each allowed field.
 */
import FormGrid from '../../../../components/ui/FormGrid';
import FieldRenderer from './FieldRenderer';
import { FIELD_SCHEMAS } from './fieldSchemas';

export default function SectionBlock({ block, values, setField }) {
  if (!block.available) {
    return (
      <div className="settings-block__missing">
        <strong className="mono">{block.doctype}</strong> — not installed on this site.
      </div>
    );
  }

  return (
    <div className="settings-block">
      <h3 className="settings-block__title">
        <span className="mono">{block.doctype}</span>
      </h3>
      <p className="settings-block__sub">
        Source-of-truth — values live in this Frappe Single.
      </p>
      <FormGrid cols="auto">
        {(block.fields || []).map((field) => {
          const key = `${block.doctype}::${field}`;
          const schema = FIELD_SCHEMAS[key] || { label: field, kind: 'text' };
          const readonly = (block.readonly_fields || []).includes(field);
          return (
            <FieldRenderer
              key={key}
              doctype={block.doctype}
              field={field}
              value={values[key]}
              onChange={setField}
              schema={{ ...schema, disabled: schema.disabled || readonly }}
            />
          );
        })}
      </FormGrid>
    </div>
  );
}
