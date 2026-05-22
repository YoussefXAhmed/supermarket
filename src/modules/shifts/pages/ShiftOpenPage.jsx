import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ApiErrorCard, Btn, PageHeader, PageLoading } from '../../../components/ui';
import { FormPageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { useAuth } from '../../../hooks/useAuth';
import { resolveShiftContext, openShift } from '../../../services/shiftsService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import ShiftStatusBadge from '../components/ShiftStatusBadge';

export default function ShiftOpenPage() {
  const { t } = useTranslation();
  const { user, canOpenShift } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [activeShift, setActiveShift] = useState(null);
  const [openingAmount, setOpeningAmount] = useState('0');
  const [modeOfPayment, setModeOfPayment] = useState('Cash');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const ctx = await resolveShiftContext({ user: user?.name });
        if (!cancelled) {
          setProfile(ctx.profile);
          setActiveShift(ctx.activeShift);
          if (ctx.activeShift) {
            setOpeningAmount(String(ctx.activeShift.openingCash ?? 0));
          }
        }
      } catch (e) {
        if (!cancelled) setError(getUserFriendlyMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.name]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canOpenShift || saving) return;
    setSaving(true);
    setError('');
    try {
      const entry = await openShift({
        posProfile: profile.name,
        company: profile.company,
        openingAmount,
        modeOfPayment,
        user: user?.name,
        canOpen: canOpenShift,
      });
      navigate('/pos', { replace: true });
    } catch (e2) {
      setError(getUserFriendlyMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  if (!canOpenShift) {
    return (
      <FormPageLayout>
        <PageHeader title={t('shifts.openShift')} subtitle={t('common.accessDenied')} dense />
        <ApiErrorCard message={t('shifts.noPermissionOpen')} />
      </FormPageLayout>
    );
  }

  return (
    <FormPageLayout>
      <PageHeader
        title={t('shifts.openShift')}
        subtitle={profile ? `${profile.name} · ${profile.warehouse}` : t('shifts.loadingRegister')}
        dense
        actions={
          <Link to="/pos" className="btn btn--ghost btn--sm">
            {t('common.pos')}
          </Link>
        }
      />

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={() => window.location.reload()} />
      ) : activeShift ? (
        <LayoutSection variant="raised" title={t('shifts.activeShift')}>
          <p className="page-header__sub">
            <span className="mono">{activeShift.name}</span> {t('shifts.alreadyOpen')}
          </p>
          <ShiftStatusBadge status={activeShift.status} docstatus={activeShift.docstatus} />
          <div className="toolbar">
            <Btn variant="primary" size="sm" onClick={() => navigate(`/shifts/close?opening=${encodeURIComponent(activeShift.name)}`)}>
              {t('shifts.goToCloseShift')}
            </Btn>
            <Link to="/pos" className="btn btn--ghost btn--sm">
              {t('shifts.continueSelling')}
            </Link>
          </div>
        </LayoutSection>
      ) : (
        <LayoutSection variant="raised" title={t('shifts.openingFloat')}>
          <form className="inv-form form-region" onSubmit={onSubmit}>
            <label>
              {t('shifts.openingCash')}
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                required
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
              />
            </label>
            <label>
              {t('shifts.modeOfPayment')}
              <select
                className="input"
                value={modeOfPayment}
                onChange={(e) => setModeOfPayment(e.target.value)}
              >
                {(profile?.paymentModes || ['Cash']).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <p className="page-header__sub">
              {t('shifts.createsOpeningEntry', { cashier: user?.email || user?.name })}
            </p>
            <Btn type="submit" variant="primary" loading={saving}>
              {t('shifts.openShift')}
            </Btn>
          </form>
        </LayoutSection>
      )}
    </FormPageLayout>
  );
}
