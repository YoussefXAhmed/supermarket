/**
 * Render one field from a settings block. The dispatcher returns
 * fieldnames only — no metadata — so the SPA tells us per-field what
 * kind of control to use via a small schema map.
 */
import { useTranslation } from 'react-i18next';

/**
 * @param {object} p
 * @param {string} p.doctype  Source doctype name
 * @param {string} p.field    Frappe fieldname
 * @param {any}    p.value    current value
 * @param {function} p.onChange  (doctype, field, value) => void
 * @param {object} p.schema   per-field metadata: {label, kind, options, help, disabled, mono}
 */
export default function FieldRenderer({ doctype, field, value, onChange, schema }) {
  const { t } = useTranslation();
  const meta = schema || {};
  const kind = meta.kind || 'text';
  const disabled = meta.disabled === true;
  const label = meta.label || field;
  const help = meta.help;
  const labelId = `lbl-${doctype.replace(/\W/g, '_')}-${field}`;
  const inputId = `inp-${doctype.replace(/\W/g, '_')}-${field}`;
  const handle = (v) => onChange(doctype, field, v);

  let control = null;
  switch (kind) {
    case 'check': {
      const checked = String(value || 0) === '1' || value === true || value === 1;
      control = (
        <label className="check-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input id={inputId} type="checkbox" checked={checked}
            disabled={disabled} onChange={(e) => handle(e.target.checked ? 1 : 0)} />
          <span>{label}</span>
        </label>
      );
      break;
    }
    case 'select': {
      control = (
        <select id={inputId} className="input" value={value ?? ''}
          disabled={disabled} onChange={(e) => handle(e.target.value)}>
          <option value="">—</option>
          {(meta.options || []).map((opt) => (
            <option key={opt.value || opt} value={opt.value || opt}>
              {opt.label || opt}
            </option>
          ))}
        </select>
      );
      break;
    }
    case 'number': {
      control = (
        <input id={inputId} type="number" className="input" value={value ?? ''}
          step={meta.step || 1} min={meta.min ?? undefined} max={meta.max ?? undefined}
          disabled={disabled}
          onChange={(e) => handle(e.target.value === '' ? null : Number(e.target.value))} />
      );
      break;
    }
    case 'time': {
      control = (
        <input id={inputId} type="time" className="input" value={value ?? ''}
          disabled={disabled} onChange={(e) => handle(e.target.value)} />
      );
      break;
    }
    case 'textarea': {
      control = (
        <textarea id={inputId} className="input" rows={meta.rows || 3} value={value ?? ''}
          disabled={disabled} onChange={(e) => handle(e.target.value)} />
      );
      break;
    }
    case 'text':
    default: {
      control = (
        <input id={inputId} type="text" className={`input ${meta.mono ? 'mono' : ''}`}
          value={value ?? ''}
          disabled={disabled} onChange={(e) => handle(e.target.value)} />
      );
    }
  }

  if (kind === 'check') {
    // Checkbox renders its own label
    return (
      <div className="setting-row" style={{ padding: '6px 0' }}>
        {control}
        {help && <p className="settings-help" style={{ margin: '4px 0 0 24px', color: 'var(--text-3)', fontSize: '0.8rem' }}>{help}</p>}
      </div>
    );
  }

  return (
    <div className="setting-row" style={{ padding: '6px 0' }}>
      <label id={labelId} htmlFor={inputId} style={{ display: 'block', fontSize: '0.84rem', fontWeight: 500, marginBottom: 4 }}>
        {label}{disabled && <span style={{ color: 'var(--text-3)' }}> · {t('settings.readonly', { defaultValue: 'read-only' })}</span>}
      </label>
      {control}
      {help && <p className="settings-help" style={{ margin: '4px 0 0', color: 'var(--text-3)', fontSize: '0.8rem' }}>{help}</p>}
    </div>
  );
}
