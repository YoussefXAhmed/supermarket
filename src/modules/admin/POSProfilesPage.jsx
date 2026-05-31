import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiErrorCard,
  Btn,
  EmptyState,
  Modal,
  PageHeader,
  PageLoading,
  Pill,
} from '../../components/ui';
import { DashboardLayout, LayoutSection } from '../../components/layout/page-layouts';
import { useAuth } from '../../hooks/useAuth';
import { useNotify } from '../../context/NotificationContext';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import {
  listPOSProfilesAdmin,
  updatePOSProfileAdmin,
  listEligibleWarehouses,
  listEligiblePriceLists,
} from '../../services/posProfileAdminApi';

function EditModal({ open, onClose, profile, warehouses, priceLists, onSave, saving, error, t }) {
  const [warehouse, setWarehouse] = useState('');
  const [priceList, setPriceList] = useState('');
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (profile) {
      setWarehouse(profile.warehouse || '');
      setPriceList(profile.selling_price_list || '');
      setDisabled(Boolean(profile.disabled));
    }
  }, [profile]);

  const dirty = useMemo(() => {
    if (!profile) return false;
    return (
      warehouse !== (profile.warehouse || '')
      || priceList !== (profile.selling_price_list || '')
      || disabled !== Boolean(profile.disabled)
    );
  }, [profile, warehouse, priceList, disabled]);

  if (!profile) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${profile.name} — ${t('posProfiles.editTitle', { defaultValue: 'Manage POS Profile' })}`}
      size="md"
      footer={(
        <>
          <Btn variant="ghost" size="md" onClick={onClose} disabled={saving}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Btn>
          <Btn
            variant="primary"
            size="md"
            loading={saving}
            disabled={!dirty}
            onClick={() => onSave({ name: profile.name, warehouse, sellingPriceList: priceList, disabled })}
          >
            {t('common.save', { defaultValue: 'Save' })}
          </Btn>
        </>
      )}
    >
      <div className="pos-profile-edit">
        <p className="pos-profile-edit__hint">
          {t('posProfiles.editHint', {
            defaultValue:
              'Warehouse switching takes effect on the next POS load. Cashiers with an open shift will keep posting to the previous warehouse until they reopen the POS.',
          })}
        </p>
        <label className="form-field">
          <span>{t('posProfiles.field.warehouse', { defaultValue: 'Warehouse' })}</span>
          <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="">—</option>
            {warehouses.map((w) => (
              <option key={w.name} value={w.name}>
                {w.warehouse_name || w.name}{w.company ? ` · ${w.company}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>{t('posProfiles.field.priceList', { defaultValue: 'Selling price list' })}</span>
          <select className="input" value={priceList} onChange={(e) => setPriceList(e.target.value)}>
            <option value="">—</option>
            {priceLists.map((p) => (
              <option key={p.name} value={p.name}>{p.name}{p.currency ? ` · ${p.currency}` : ''}</option>
            ))}
          </select>
        </label>
        <label className="form-field form-field--checkbox">
          <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
          <span>{t('posProfiles.field.disabled', { defaultValue: 'Disabled (hide from cashiers)' })}</span>
        </label>
        {error && <p className="inv-error">{error}</p>}
      </div>
    </Modal>
  );
}

export default function POSProfilesPage() {
  const { t } = useTranslation();
  const { capabilities } = useAuth();
  const notify = useNotify();
  const canManage = Boolean(capabilities?.canManagePOSProfiles || capabilities?.canManageSystem);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const reload = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setError('');
    try {
      const [res, wh, pls] = await Promise.all([
        listPOSProfilesAdmin(),
        listEligibleWarehouses(),
        listEligiblePriceLists(),
      ]);
      setRows(res?.rows || []);
      setWarehouses(wh || []);
      setPriceLists(pls || []);
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => { reload(); }, [reload]);

  const onSave = useCallback(
    async ({ name, warehouse, sellingPriceList, disabled }) => {
      setSaving(true);
      setEditError('');
      try {
        const res = await updatePOSProfileAdmin({ name, warehouse, sellingPriceList, disabled });
        if (res?.noop) {
          notify.info(t('posProfiles.noop', { defaultValue: 'No changes to save.' }));
        } else {
          notify.success(
            t('posProfiles.savedSummary', {
              defaultValue: 'Saved: {{fields}}',
              fields: (res?.changed || []).join(', ') || '—',
            }),
          );
        }
        setEditing(null);
        await reload();
      } catch (e) {
        setEditError(getUserFriendlyMessage(e));
      } finally {
        setSaving(false);
      }
    },
    [notify, reload, t],
  );

  if (!canManage) {
    return (
      <DashboardLayout>
        <PageHeader title={t('posProfiles.title', { defaultValue: 'POS Profiles' })} subtitle={t('common.accessDenied')} dense />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={t('posProfiles.title', { defaultValue: 'POS Profiles' })}
        subtitle={t('posProfiles.subtitle', { defaultValue: 'Assign warehouse and selling price list per POS terminal' })}
        dense
        actions={<Btn variant="ghost" size="sm" onClick={reload}>{t('common.refresh', { defaultValue: 'Refresh' })}</Btn>}
      />

      {loading && <PageLoading />}
      {!loading && error && <ApiErrorCard title={t('posProfiles.error', { defaultValue: 'Could not load POS Profiles' })} message={error} onRetry={reload} />}
      {!loading && !error && (
        <LayoutSection variant="raised">
          {rows.length === 0 ? (
            <EmptyState
              icon="🏬"
              title={t('posProfiles.empty', { defaultValue: 'No POS Profiles configured' })}
              desc={t('posProfiles.emptyDesc', { defaultValue: 'Create POS Profiles in ERPNext first, then assign warehouses here.' })}
            />
          ) : (
            <table className="data-table data-table--fill">
              <thead>
                <tr>
                  <th>{t('posProfiles.col.name', { defaultValue: 'POS Profile' })}</th>
                  <th>{t('posProfiles.col.company', { defaultValue: 'Company' })}</th>
                  <th className="fill-col">{t('posProfiles.col.warehouse', { defaultValue: 'Warehouse' })}</th>
                  <th>{t('posProfiles.col.priceList', { defaultValue: 'Price list' })}</th>
                  <th>{t('posProfiles.col.currency', { defaultValue: 'Currency' })}</th>
                  <th>{t('posProfiles.col.state', { defaultValue: 'State' })}</th>
                  <th aria-label={t('posProfiles.col.actions', { defaultValue: 'Actions' })}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name}>
                    <td className="mono">{row.name}</td>
                    <td>{row.company || '—'}</td>
                    <td className="fill-col">{row.warehouse || '—'}</td>
                    <td>{row.selling_price_list || '—'}</td>
                    <td>{row.currency || '—'}</td>
                    <td>
                      <Pill tone={row.disabled ? 'danger' : 'success'}>
                        {row.disabled
                          ? t('posProfiles.disabled', { defaultValue: 'Disabled' })
                          : t('posProfiles.active', { defaultValue: 'Active' })}
                      </Pill>
                    </td>
                    <td>
                      <Btn variant="ghost" size="sm" onClick={() => { setEditing(row); setEditError(''); }}>
                        {t('common.edit', { defaultValue: 'Edit' })}
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </LayoutSection>
      )}

      <EditModal
        open={Boolean(editing)}
        onClose={() => { setEditing(null); setEditError(''); }}
        profile={editing}
        warehouses={warehouses}
        priceLists={priceLists}
        onSave={onSave}
        saving={saving}
        error={editError}
        t={t}
      />
    </DashboardLayout>
  );
}
