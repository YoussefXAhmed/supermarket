import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormPageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { ApiErrorCard, Btn, PageHeader } from '../../../components/ui';
import { getItems } from '../../../services/api';
import { createAndSubmitStockReconciliation, listWarehouses } from '../../../services/inventoryApi';
import { getSellableStock } from '../../../services/stockService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

export default function ReconciliationPage() {
  const { t } = useTranslation();

  const PURPOSES = [
    { value: 'Stock Reconciliation', label: t('inventory.reconciliation.inventoryCount') },
    { value: 'Opening Stock', label: t('inventory.reconciliation.openingStock') },
  ];

  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [purpose, setPurpose] = useState('Stock Reconciliation');
  const [lines, setLines] = useState([{ item_code: '', qty: '', current_qty: null }]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    listWarehouses({ limit: 200 }).then((r) => {
      const wh = r?.data?.data || [];
      setWarehouses(wh);
      if (wh[0]) setWarehouse(wh[0].name);
    });
    getItems({ limit: 500 }).then((r) => setItems(r?.data?.data || []));
  }, []);

  const fetchCurrentQty = async (index, itemCode) => {
    if (!itemCode || !warehouse) return;
    try {
      const row = await getSellableStock({ itemCode: itemCode.trim(), warehouse });
      const current = Number(row?.actual_qty || 0);
      setLines((prev) => prev.map((row, i) => (i === index ? { ...row, item_code: itemCode, current_qty: current, qty: row.qty || String(current) } : row)));
    } catch {
      setLines((prev) => prev.map((row, i) => (i === index ? { ...row, item_code: itemCode, current_qty: null } : row)));
    }
  };

  const addLine = () => setLines((prev) => [...prev, { item_code: '', qty: '', current_qty: null }]);
  const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    const wh = warehouses.find((w) => w.name === warehouse);
    if (!wh) {
      setErr(t('inventory.reconciliation.selectWarehouse'));
      return;
    }
    const validLines = lines.filter((l) => l.item_code?.trim() && l.qty !== '');
    if (!validLines.length) {
      setErr(t('inventory.reconciliation.addAtLeastOne'));
      return;
    }

    setSaving(true);
    try {
      const name = await createAndSubmitStockReconciliation({
        company: wh.company,
        purpose,
        warehouse,
        items: validLines.map((l) => ({
          item_code: l.item_code.trim(),
          warehouse,
          qty: Number(l.qty),
        })),
      });
      setMsg(t('inventory.reconciliation.submitted', { name }));
      setLines([{ item_code: '', qty: '', current_qty: null }]);
    } catch (e2) {
      setErr(getUserFriendlyMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPageLayout>
      <PageHeader title={t('inventory.reconciliation.title')} subtitle={t('inventory.reconciliation.subtitle')} dense />
      <LayoutSection variant="raised" flushHead>
        <form className="inv-form form-region" onSubmit={onSubmit}>
          <label>
            {t('inventory.reconciliation.warehouse')}
            <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} required>
              {warehouses.map((w) => <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>)}
            </select>
          </label>
          <label>
            {t('inventory.reconciliation.purpose')}
            <select className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              {PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>

          <p className="section-title">{t('inventory.reconciliation.countedQtys')}</p>
          {lines.map((line, index) => (
            <div key={index} className="recon-line">
              <input
                className="input"
                list="recon-items"
                placeholder={t('inventory.reconciliation.itemCodePlaceholder')}
                value={line.item_code}
                onChange={(e) => fetchCurrentQty(index, e.target.value)}
                required
              />
              <span className="inv-hint">{t('inventory.reconciliation.erpHint')}: {line.current_qty != null ? line.current_qty : '—'}</span>
              <input
                className="input"
                type="number"
                min="0"
                step="any"
                placeholder={t('inventory.reconciliation.countedQty')}
                value={line.qty}
                onChange={(e) => setLines((prev) => prev.map((r, i) => (i === index ? { ...r, qty: e.target.value } : r)))}
                required
              />
              {lines.length > 1 && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeLine(index)}>{t('common.remove')}</button>
              )}
            </div>
          ))}
          <datalist id="recon-items">{items.map((it) => <option key={it.item_code} value={it.item_code} />)}</datalist>
          <Btn type="button" variant="ghost" size="sm" onClick={addLine}>{t('inventory.reconciliation.addLine')}</Btn>
          <Btn type="submit" variant="primary" size="md" loading={saving}>{t('inventory.reconciliation.submit')}</Btn>
        </form>
        {msg && <p className="inv-success">{msg}</p>}
        {err && <ApiErrorCard message={err} />}
      </LayoutSection>
    </FormPageLayout>
  );
}
