import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MovementTimeline from '../../../components/inventory/MovementTimeline';
import { ApiErrorCard, Badge, Btn, EmptyState, PageHeader, PageLoading, Table } from '../../../components/ui';
import { AdminPageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { getItemDetails, listBatches } from '../../../services/inventoryApi';
import { getItemMovementTimeline } from '../../../services/inventoryService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { useInventoryCapabilities } from '../../../hooks/useInventoryCapabilities';
import { useAuth } from '../../../hooks/useAuth';
import { useNotify } from '../../../context/NotificationContext';
import { getItemThresholds, updateItemThresholds } from '../../../services/inventoryThresholdsApi';
import api from '../../../services/api';


function ThresholdsEditor({ itemCode }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const { capabilities } = useAuth();
  const canEdit = Boolean(capabilities?.canManageSystem || capabilities?.canAccessManagerWorkspace);

  const [data, setData] = useState({ alert_level: 0, reorder_level: 0, reorder_qty: 0 });
  const [draft, setDraft] = useState({ alert_level: 0, reorder_level: 0, reorder_qty: 0 });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!itemCode) return;
    setLoading(true);
    setError('');
    getItemThresholds(itemCode)
      .then((res) => {
        if (cancelled) return;
        const next = {
          alert_level: res?.alert_level || 0,
          reorder_level: res?.reorder_level || 0,
          reorder_qty: res?.reorder_qty || 0,
        };
        setData(next);
        setDraft(next);
      })
      .catch((e) => {
        if (!cancelled) setError(getUserFriendlyMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [itemCode]);

  const dirty = (
    Number(draft.alert_level) !== Number(data.alert_level)
    || Number(draft.reorder_level) !== Number(data.reorder_level)
    || Number(draft.reorder_qty) !== Number(data.reorder_qty)
  );

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await updateItemThresholds({
        itemCode,
        alertLevel: Number(draft.alert_level),
        reorderLevel: Number(draft.reorder_level),
        reorderQty: Number(draft.reorder_qty),
      });
      if (res?.noop) {
        notify.info(t('inventory.thresholds.noChanges', { defaultValue: 'No changes to save.' }));
      } else {
        setData(draft);
        notify.success(
          t('inventory.thresholds.saved', { defaultValue: 'Inventory thresholds saved.' }),
        );
      }
    } catch (e) {
      const msg = getUserFriendlyMessage(e);
      setError(msg);
      notify.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="page-header__sub">{t('ui.loading')}</p>;

  return (
    <div className="thresholds-editor">
      <div className="thresholds-editor__grid">
        <label className="form-field">
          <span className="form-field__label">
            {t('inventory.thresholds.alert', { defaultValue: 'Alert Level' })}
          </span>
          <input
            type="number"
            min="0"
            step="1"
            className="input"
            value={draft.alert_level}
            onChange={(e) => setDraft((d) => ({ ...d, alert_level: e.target.value }))}
            disabled={!canEdit}
          />
        </label>
        <label className="form-field">
          <span className="form-field__label">
            {t('inventory.thresholds.reorder', { defaultValue: 'Reorder Level' })}
          </span>
          <input
            type="number"
            min="0"
            step="1"
            className="input"
            value={draft.reorder_level}
            onChange={(e) => setDraft((d) => ({ ...d, reorder_level: e.target.value }))}
            disabled={!canEdit}
          />
        </label>
        <label className="form-field">
          <span className="form-field__label">
            {t('inventory.thresholds.qty', { defaultValue: 'Reorder Quantity' })}
          </span>
          <input
            type="number"
            min="0"
            step="1"
            className="input"
            value={draft.reorder_qty}
            onChange={(e) => setDraft((d) => ({ ...d, reorder_qty: e.target.value }))}
            disabled={!canEdit}
          />
        </label>
      </div>
      {canEdit ? (
        <div className="thresholds-editor__actions">
          <Btn variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={save}>
            {t('common.save')}
          </Btn>
          {dirty && (
            <Btn variant="ghost" size="sm" disabled={saving} onClick={() => setDraft(data)}>
              {t('common.cancel')}
            </Btn>
          )}
        </div>
      ) : (
        <p className="page-header__sub">
          {t('inventory.thresholds.readOnly', {
            defaultValue: 'Store Manager or Administrator can edit these thresholds.',
          })}
        </p>
      )}
      {error && <p className="inv-error">{error}</p>}
    </div>
  );
}

export default function ItemDetailsPage() {
  const { t } = useTranslation();
  const { canInventoryViewValuation } = useInventoryCapabilities();
  const [itemCode, setItemCode] = useState('');
  const [item, setItem] = useState(null);
  const [bins, setBins] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!itemCode.trim()) return;
    setLoading(true);
    setError('');
    const code = itemCode.trim();
    try {
      const [itemRes, binsRes, timelineRows] = await Promise.all([
        getItemDetails(code),
        api.get('/api/method/elmahdi.api.stock.list_sellable_bins', {
          params: { item_codes: JSON.stringify([code]), limit: 5000 },
        }),
        getItemMovementTimeline(code, { limit: 80 }),
      ]);
      const itemDoc = itemRes?.data?.data || null;
      setItem(itemDoc);
      setBins(binsRes?.data?.message || []);
      setTimeline(timelineRows);

      if (itemDoc?.has_batch_no) {
        const batchRes = await listBatches({ filters: [['item', '=', code]], limit: 50 });
        setBatches(batchRes?.data?.data || []);
      } else {
        setBatches([]);
      }
    } catch (e) {
      setItem(null);
      setBins([]);
      setTimeline([]);
      setBatches([]);
      setError(getUserFriendlyMessage(e, t('inventory.itemDetails.loadError')));
    } finally {
      setLoading(false);
    }
  };

  const binColumns = [
    { key: 'warehouse', label: t('inventory.table.warehouse') },
    { key: 'actual_qty', label: t('inventory.table.onHand'), render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'reserved_qty', label: t('inventory.table.reserved'), render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'valuation_rate', label: t('inventory.table.valuation'), render: (v) => `EGP ${Number(v || 0).toFixed(2)}` },
  ];

  const batchColumns = [
    { key: 'name', label: t('inventory.batches.title'), render: (v) => <span className="mono">{v}</span> },
    { key: 'batch_qty', label: t('inventory.table.qty'), render: (v) => Number(v || 0).toFixed(2) },
    { key: 'expiry_date', label: t('inventory.itemDetails.expiry') },
  ];

  return (
    <AdminPageLayout>
      <PageHeader title={t('inventory.itemDetails.title')} subtitle={t('inventory.itemDetails.subtitle')} dense />

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar">
          <div className="toolbar__group">
            <input
              className="input toolbar__input-sm"
              placeholder={t('inventory.itemDetails.itemCodePlaceholder')}
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
            <Btn variant="ghost" size="sm" onClick={load}>
              {t('inventory.itemDetails.loadItem')}
            </Btn>
          </div>
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : !item ? (
        <EmptyState icon="🧾" title={t('inventory.itemDetails.noItem')} desc={t('inventory.itemDetails.noItemDesc')} />
      ) : (
        <>
          <LayoutSection
            variant="raised"
            title={item.item_name || item.item_code}
            subtitle={t('inventory.itemDetails.itemMaster')}
          >
            <div className="meta-grid">
              <p>
                <strong>{t('inventory.itemDetails.code')}:</strong> <span className="mono">{item.item_code}</span>
              </p>
              <p>
                <strong>{t('inventory.itemDetails.group')}:</strong> {item.item_group || '—'}
              </p>
              <p>
                <strong>{t('inventory.itemDetails.uom')}:</strong> {item.stock_uom || '—'}
              </p>
              {canInventoryViewValuation ? (
                <p>
                  <strong>{t('inventory.itemDetails.rate')}:</strong> EGP {Number(item.standard_rate || 0).toFixed(2)}
                </p>
              ) : null}
              {item.has_batch_no ? <p><Badge color="blue">{t('inventory.itemDetails.batchTracked')}</Badge></p> : null}
            </div>
          </LayoutSection>

          <LayoutSection
            variant="raised"
            title={t('inventory.thresholds.title', { defaultValue: 'Inventory thresholds' })}
            subtitle={t('inventory.thresholds.subtitle', {
              defaultValue: 'Item-level alert + reorder levels. Used by the Alerts and Reorder pages.',
            })}
          >
            <ThresholdsEditor itemCode={item.name} />
          </LayoutSection>

          <LayoutSection variant="raised" title={t('inventory.itemDetails.warehouseStock')}>
            {bins.length === 0 ? (
              <EmptyState title={t('inventory.itemDetails.noBinRecords')} />
            ) : (
              <TableRegion>
                <Table columns={binColumns} data={bins} compact />
              </TableRegion>
            )}
          </LayoutSection>

          {batches.length > 0 && (
            <LayoutSection variant="raised" title={t('inventory.itemDetails.batches')}>
              <TableRegion>
                <Table columns={batchColumns} data={batches} compact />
              </TableRegion>
            </LayoutSection>
          )}

          <LayoutSection variant="raised" title={t('inventory.itemDetails.movementTimeline')}>
            <MovementTimeline rows={timeline} />
          </LayoutSection>
        </>
      )}
    </AdminPageLayout>
  );
}
