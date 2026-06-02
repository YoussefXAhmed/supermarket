import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ApiErrorCard,
  Badge,
  Btn,
  PageHeader,
  PageLoading,
} from '../../../components/ui';
import { AdminPageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { useNotify } from '../../../context/NotificationContext';
import { useAuth } from '../../../hooks/useAuth';
import { ERP_BASE_URL } from '../../../config/erp';
import {
  getItemMaster,
  updateItemMaster,
  uploadItemImage,
} from '../../../services/itemMasterApi';
import { getItemThresholds, updateItemThresholds } from '../../../services/inventoryThresholdsApi';
import { canEditItemMaster, canEditItemPricing } from '../../../auth/navigationConfig';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';

function absImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${ERP_BASE_URL || ''}${url}`;
}

const EMPTY = {
  item_code: '',
  item_name: '',
  item_group: '',
  brand: '',
  stock_uom: '',
  country_of_origin: '',
  description: '',
  image: '',
  selling_price: 0,
  buying_price: 0,
  barcode: '',
  has_batch_no: 0,
  shelf_life_in_days: 0,
  disabled: 0,
};

export default function ItemEditPage() {
  const { t } = useTranslation();
  const { itemCode } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { capabilities } = useAuth();
  const canEditDetails = canEditItemMaster(capabilities);
  const canEditPricing = canEditItemPricing(capabilities);

  const [data, setData] = useState(EMPTY);
  const [draft, setDraft] = useState(EMPTY);
  const [thresholds, setThresholds] = useState({ alert_level: 0, reorder_level: 0, reorder_qty: 0 });
  const [thresholdsDraft, setThresholdsDraft] = useState({ alert_level: 0, reorder_level: 0, reorder_qty: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (!itemCode) return;
    setLoading(true);
    setError('');
    try {
      const [item, th] = await Promise.all([
        getItemMaster(itemCode),
        getItemThresholds(itemCode).catch(() => null),
      ]);
      const filled = { ...EMPTY, ...item };
      setData(filled);
      setDraft(filled);
      const tNext = {
        alert_level: th?.alert_level || 0,
        reorder_level: th?.reorder_level || 0,
        reorder_qty: th?.reorder_qty || 0,
      };
      setThresholds(tNext);
      setThresholdsDraft(tNext);
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [itemCode]);

  useEffect(() => { load(); }, [load]);

  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setThField = (k, v) => setThresholdsDraft((d) => ({ ...d, [k]: v }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(data);
  const thresholdsDirty = JSON.stringify(thresholdsDraft) !== JSON.stringify(thresholds);

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!canEditDetails && !canEditPricing) return;
    setSaving(true);
    try {
      if (dirty) {
        // Only send fields the user is allowed to change. Pricing fields are
        // included only when the user has admin-level pricing rights — this
        // is a defense-in-depth check; the backend also rejects them.
        const payload = {};
        if (canEditDetails) {
          payload.item_name = draft.item_name;
          payload.item_group = draft.item_group;
          payload.brand = draft.brand;
          payload.stock_uom = draft.stock_uom;
          payload.country_of_origin = draft.country_of_origin;
          payload.description = draft.description;
          payload.barcode = draft.barcode || '';
          payload.has_batch_no = draft.has_batch_no ? 1 : 0;
          payload.shelf_life_in_days = Number(draft.shelf_life_in_days) || 0;
          payload.disabled = draft.disabled ? 1 : 0;
        }
        if (canEditPricing) {
          payload.selling_price = Number(draft.selling_price) || 0;
          payload.buying_price = Number(draft.buying_price) || 0;
        }
        if (Object.keys(payload).length > 0) {
          const fresh = await updateItemMaster(itemCode, payload);
          if (fresh) {
            const filled = { ...EMPTY, ...fresh };
            setData(filled);
            setDraft(filled);
          }
        }
      }
      if (thresholdsDirty && canEditDetails) {
        await updateItemThresholds({
          itemCode,
          alertLevel: Number(thresholdsDraft.alert_level) || 0,
          reorderLevel: Number(thresholdsDraft.reorder_level) || 0,
          reorderQty: Number(thresholdsDraft.reorder_qty) || 0,
        });
        setThresholds(thresholdsDraft);
      }
      notify.success(t('itemEdit.saved', { defaultValue: 'Item saved.' }));
    } catch (err) {
      notify.error(getUserFriendlyMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!canEditDetails) return;
    setUploading(true);
    try {
      const res = await uploadItemImage(itemCode, file);
      if (res?.image) {
        const next = { ...data, image: res.image };
        setData(next);
        setDraft((d) => ({ ...d, image: res.image }));
        notify.success(t('itemEdit.imageSaved', { defaultValue: 'Image updated.' }));
      }
    } catch (err) {
      notify.error(getUserFriendlyMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <AdminPageLayout>
        <PageHeader title={t('itemEdit.title', { defaultValue: 'Edit item' })} dense />
        <PageLoading />
      </AdminPageLayout>
    );
  }
  if (error) {
    return (
      <AdminPageLayout>
        <PageHeader title={t('itemEdit.title', { defaultValue: 'Edit item' })} dense />
        <ApiErrorCard message={error} onRetry={load} />
      </AdminPageLayout>
    );
  }

  const fmtCurrency = (n) => `EGP ${Number(n || 0).toFixed(2)}`;

  return (
    <AdminPageLayout>
      <PageHeader
        title={data.item_name || data.item_code}
        subtitle={
          <span>
            <span className="mono">{data.item_code}</span>
            {data.disabled ? <Badge color="red" style={{ marginInlineStart: 8 }}>{t('itemEdit.disabled', { defaultValue: 'Disabled' })}</Badge> : null}
          </span>
        }
        dense
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={() => navigate('/inventory')}>
              ← {t('common.back', { defaultValue: 'Back' })}
            </Btn>
            {(canEditDetails || canEditPricing) && (
              <Btn
                variant="primary"
                size="sm"
                loading={saving}
                disabled={!dirty && !thresholdsDirty}
                onClick={handleSave}
              >
                {t('common.save')}
              </Btn>
            )}
          </>
        }
      />

      {!canEditDetails && !canEditPricing && (
        <p className="empty-inline" style={{ marginBottom: 'var(--space-3)' }}>
          {t('itemEdit.readOnlyHint', {
            defaultValue: 'Read-only view — only Administrator and Store Manager can edit items.',
          })}
        </p>
      )}

      <form onSubmit={handleSave} className="stack" style={{ gap: 'var(--space-3)' }}>
        {/* Product information — name, code, barcode, image, brand, group, batch settings */}
        <LayoutSection
          variant="raised"
          title={t('itemEdit.productInfo', { defaultValue: 'Product information' })}
          subtitle={t('itemEdit.productInfoSub', {
            defaultValue: 'Editable by Administrator and Store Manager.',
          })}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 'var(--space-4)' }}>
            <div>
              <div
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-3)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {data.image ? (
                  <img
                    src={absImageUrl(data.image)}
                    alt={data.item_name || data.item_code}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: '2.4rem', opacity: 0.35 }}>📦</span>
                )}
              </div>
              {canEditDetails && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleImage}
                    style={{ display: 'none' }}
                  />
                  <Btn
                    variant="ghost"
                    size="sm"
                    type="button"
                    loading={uploading}
                    onClick={() => fileRef.current?.click()}
                    style={{ width: '100%', marginTop: 'var(--space-2)' }}
                  >
                    {data.image
                      ? t('itemEdit.replaceImage', { defaultValue: 'Replace image' })
                      : t('itemEdit.uploadImage', { defaultValue: 'Upload image' })}
                  </Btn>
                </>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                <span className="form-field__label">{t('itemEdit.itemName', { defaultValue: 'Item name' })}</span>
                <input
                  className="input"
                  value={draft.item_name}
                  onChange={(e) => setField('item_name', e.target.value)}
                  disabled={!canEditDetails}
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">{t('itemEdit.itemCode', { defaultValue: 'Item code' })}</span>
                <input className="input mono" value={data.item_code} disabled readOnly />
              </label>
              <label className="form-field">
                <span className="form-field__label">{t('itemEdit.barcode', { defaultValue: 'Barcode' })}</span>
                <input
                  className="input mono"
                  value={draft.barcode || ''}
                  onChange={(e) => setField('barcode', e.target.value)}
                  disabled={!canEditDetails}
                  placeholder="6224000000000"
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">{t('itemEdit.itemGroup', { defaultValue: 'Item group' })}</span>
                <input
                  className="input"
                  value={draft.item_group || ''}
                  onChange={(e) => setField('item_group', e.target.value)}
                  disabled={!canEditDetails}
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">{t('itemEdit.brand', { defaultValue: 'Brand' })}</span>
                <input
                  className="input"
                  value={draft.brand || ''}
                  onChange={(e) => setField('brand', e.target.value)}
                  disabled={!canEditDetails}
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">{t('itemEdit.uom', { defaultValue: 'Unit of measure' })}</span>
                <input
                  className="input"
                  value={draft.stock_uom || ''}
                  onChange={(e) => setField('stock_uom', e.target.value)}
                  disabled={!canEditDetails}
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">{t('itemEdit.country', { defaultValue: 'Country of origin' })}</span>
                <input
                  className="input"
                  value={draft.country_of_origin || ''}
                  onChange={(e) => setField('country_of_origin', e.target.value)}
                  disabled={!canEditDetails}
                />
              </label>
              <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                <span className="form-field__label">{t('itemEdit.description', { defaultValue: 'Description' })}</span>
                <textarea
                  className="input"
                  rows={2}
                  value={draft.description || ''}
                  onChange={(e) => setField('description', e.target.value)}
                  disabled={!canEditDetails}
                />
              </label>
            </div>
          </div>
        </LayoutSection>

        {/* Pricing — Administrator only */}
        <LayoutSection
          variant="raised"
          title={t('itemEdit.pricing', { defaultValue: 'Pricing' })}
          subtitle={t('itemEdit.pricingSub', {
            defaultValue: 'Editable by Administrator only.',
          })}
        >
          {!canEditPricing && (
            <div
              className="empty-inline"
              style={{
                marginBottom: 'var(--space-3)',
                background: 'var(--amber-bg)',
                color: 'var(--amber)',
                borderColor: 'rgba(245,158,11,0.4)',
                borderStyle: 'solid',
                textAlign: 'start',
              }}
            >
              🔒 {t('itemEdit.pricingAdminOnly', {
                defaultValue: 'Only administrators can modify pricing.',
              })}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
            <label className="form-field">
              <span className="form-field__label">{t('itemEdit.buyingPrice', { defaultValue: 'Buying price (EGP)' })}</span>
              <input
                className="input mono"
                type="number"
                min="0"
                step="0.01"
                value={draft.buying_price ?? 0}
                onChange={(e) => setField('buying_price', e.target.value)}
                disabled={!canEditPricing}
                readOnly={!canEditPricing}
              />
            </label>
            <label className="form-field">
              <span className="form-field__label">{t('itemEdit.sellingPrice', { defaultValue: 'Selling price (EGP)' })}</span>
              <input
                className="input mono"
                type="number"
                min="0"
                step="0.01"
                value={draft.selling_price ?? 0}
                onChange={(e) => setField('selling_price', e.target.value)}
                disabled={!canEditPricing}
                readOnly={!canEditPricing}
              />
            </label>
            <div className="form-field">
              <span className="form-field__label">{t('itemEdit.margin', { defaultValue: 'Margin' })}</span>
              <div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-2)' }}>
                {(() => {
                  const buy = Number(draft.buying_price) || 0;
                  const sell = Number(draft.selling_price) || 0;
                  if (!buy || !sell) return <span style={{ color: 'var(--text-3)' }}>—</span>;
                  const pct = ((sell - buy) / sell) * 100;
                  const color = pct < 0 ? 'var(--red)' : pct < 10 ? 'var(--amber)' : 'var(--green)';
                  return (
                    <span className="mono" style={{ color, fontWeight: 600 }}>
                      {fmtCurrency(sell - buy)} ({pct.toFixed(1)}%)
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        </LayoutSection>

        {/* Tracking */}
        <LayoutSection variant="raised" title={t('itemEdit.tracking', { defaultValue: 'Batch & expiry tracking' })}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <label className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(Number(draft.has_batch_no))}
                  onChange={(e) => setField('has_batch_no', e.target.checked ? 1 : 0)}
                  disabled={!canEditDetails}
                />
                <span>{t('itemEdit.hasBatch', { defaultValue: 'Track by batch (enables production + expiry date per batch)' })}</span>
              </span>
            </label>
            <label className="form-field">
              <span className="form-field__label">
                {t('itemEdit.shelfLife', { defaultValue: 'Shelf life (days)' })}
              </span>
              <input
                className="input mono"
                type="number"
                min="0"
                step="1"
                value={draft.shelf_life_in_days ?? 0}
                onChange={(e) => setField('shelf_life_in_days', e.target.value)}
                disabled={!canEditDetails}
                placeholder="e.g. 365"
              />
            </label>
          </div>
        </LayoutSection>

        {/* Inventory thresholds */}
        <LayoutSection
          variant="raised"
          title={t('itemEdit.thresholds', { defaultValue: 'Low-stock thresholds' })}
          subtitle={t('itemEdit.thresholdsSub', {
            defaultValue: 'Alert fires when stock ≤ alert level. Reorder suggestion uses the reorder level + quantity.',
          })}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
            <label className="form-field">
              <span className="form-field__label">{t('inventory.thresholds.alert', { defaultValue: 'Alert level' })}</span>
              <input
                className="input mono"
                type="number"
                min="0"
                step="1"
                value={thresholdsDraft.alert_level ?? 0}
                onChange={(e) => setThField('alert_level', e.target.value)}
                disabled={!canEditDetails}
              />
            </label>
            <label className="form-field">
              <span className="form-field__label">{t('inventory.thresholds.reorder', { defaultValue: 'Reorder level' })}</span>
              <input
                className="input mono"
                type="number"
                min="0"
                step="1"
                value={thresholdsDraft.reorder_level ?? 0}
                onChange={(e) => setThField('reorder_level', e.target.value)}
                disabled={!canEditDetails}
              />
            </label>
            <label className="form-field">
              <span className="form-field__label">{t('inventory.thresholds.qty', { defaultValue: 'Reorder quantity' })}</span>
              <input
                className="input mono"
                type="number"
                min="0"
                step="1"
                value={thresholdsDraft.reorder_qty ?? 0}
                onChange={(e) => setThField('reorder_qty', e.target.value)}
                disabled={!canEditDetails}
              />
            </label>
          </div>
        </LayoutSection>

        {/* Status */}
        {canEditDetails && (
          <LayoutSection variant="flat" title={t('itemEdit.status', { defaultValue: 'Status' })}>
            <label className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={Boolean(Number(draft.disabled))}
                onChange={(e) => setField('disabled', e.target.checked ? 1 : 0)}
              />
              <span>{t('itemEdit.disable', { defaultValue: 'Disable this item (hides from POS, alerts, and inventory listings)' })}</span>
            </label>
          </LayoutSection>
        )}

        {(canEditDetails || canEditPricing) && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            {(dirty || thresholdsDirty) && (
              <Btn
                variant="ghost"
                type="button"
                onClick={() => { setDraft(data); setThresholdsDraft(thresholds); }}
                disabled={saving}
              >
                {t('common.cancel')}
              </Btn>
            )}
            <Btn variant="primary" type="submit" loading={saving} disabled={!dirty && !thresholdsDirty}>
              {t('common.save')}
            </Btn>
          </div>
        )}
      </form>

      <p style={{ marginTop: 'var(--space-3)', fontSize: '0.78rem', color: 'var(--text-3)' }}>
        <Link to="/inventory">← {t('itemEdit.backToList', { defaultValue: 'Back to inventory' })}</Link>
      </p>
    </AdminPageLayout>
  );
}
