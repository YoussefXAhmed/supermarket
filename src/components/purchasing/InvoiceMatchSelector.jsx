import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn } from '../ui';
import { fmtCurrency } from '../../utils/format';
import { searchMatchableDraftInvoices } from '../../services/invoiceMatchingService';

export default function InvoiceMatchSelector({
  receiptName,
  suggested = [],
  disabled = false,
  onSelect,
  linking = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState('');
  const wrapRef = useRef(null);

  const loadOptions = useCallback(
    async (term) => {
      if (!receiptName) return;
      setLoading(true);
      try {
        const rows = await searchMatchableDraftInvoices(receiptName, {
          search: term,
          limit: 25,
        });
        setOptions(rows || []);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [receiptName],
  );

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => loadOptions(search), 200);
    return () => clearTimeout(t);
  }, [open, search, loadOptions]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (name) => {
    setSelected(name);
    setOpen(false);
    setSearch('');
  };

  const handleLink = () => {
    if (!selected || !onSelect) return;
    onSelect(selected);
  };

  const merged = [...(suggested || [])];
  for (const opt of options) {
    if (!merged.some((m) => m.name === opt.name)) merged.push(opt);
  }

  return (
    <div className="invoice-match-selector" ref={wrapRef}>
      {suggested?.length > 0 && !selected && (
        <div className="invoice-match-selector__suggestions">
          <span className="invoice-match-selector__hint">Suggested:</span>
          {suggested.slice(0, 3).map((s) => (
            <button
              key={s.name}
              type="button"
              className="invoice-match-selector__chip"
              onClick={() => pick(s.name)}
              disabled={disabled || linking}
            >
              {s.name}
              <span className="invoice-match-selector__chip-score">score {s.match_score}</span>
            </button>
          ))}
        </div>
      )}

      <div className="invoice-match-selector__row">
        <button
          type="button"
          className="input invoice-match-selector__trigger"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled || linking}
        >
          {selected || 'Select draft invoice…'}
        </button>
        <Btn
          variant="primary"
          size="sm"
          loading={linking}
          disabled={!selected || disabled}
          onClick={handleLink}
        >
          Link
        </Btn>
      </div>

      {open && (
        <div className="invoice-match-selector__panel">
          <input
            className="input"
            placeholder="Search draft PINV…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {loading ? (
            <p className="invoice-match-selector__empty">Loading…</p>
          ) : merged.length === 0 ? (
            <p className="invoice-match-selector__empty">
              No draft invoices for this supplier and company.
            </p>
          ) : (
            <ul className="invoice-match-selector__list">
              {merged.map((row) => (
                <li key={row.name}>
                  <button
                    type="button"
                    className={`invoice-match-selector__option${
                      selected === row.name ? ' invoice-match-selector__option--active' : ''
                    }`}
                    onClick={() => pick(row.name)}
                  >
                    <span className="mono">{row.name}</span>
                    <span className="invoice-match-selector__option-meta">
                      {fmtCurrency(row.grand_total)} · {row.posting_date}
                      {row.already_linked ? ' · linked' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
