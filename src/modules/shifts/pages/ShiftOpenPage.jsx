import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiErrorCard, Btn, PageHeader, PageLoading } from '../../../components/ui';
import { FormPageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { useAuth } from '../../../hooks/useAuth';
import { resolveShiftContext, openShift } from '../../../services/shiftsService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import ShiftStatusBadge from '../components/ShiftStatusBadge';

export default function ShiftOpenPage() {
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
        <PageHeader title="Open shift" subtitle="Access denied" dense />
        <ApiErrorCard message="You do not have permission to open shifts." />
      </FormPageLayout>
    );
  }

  return (
    <FormPageLayout>
      <PageHeader
        title="Open shift"
        subtitle={profile ? `${profile.name} · ${profile.warehouse}` : 'Loading register…'}
        dense
        actions={
          <Link to="/pos" className="btn btn--ghost btn--sm">
            POS
          </Link>
        }
      />

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={() => window.location.reload()} />
      ) : activeShift ? (
        <LayoutSection variant="raised" title="Active shift">
          <p className="page-header__sub">
            <span className="mono">{activeShift.name}</span> is already open.
          </p>
          <ShiftStatusBadge status={activeShift.status} docstatus={activeShift.docstatus} />
          <div className="toolbar">
            <Btn variant="primary" size="sm" onClick={() => navigate(`/shifts/close?opening=${encodeURIComponent(activeShift.name)}`)}>
              Go to close shift
            </Btn>
            <Link to="/pos" className="btn btn--ghost btn--sm">
              Continue selling
            </Link>
          </div>
        </LayoutSection>
      ) : (
        <LayoutSection variant="raised" title="Opening float">
          <form className="inv-form form-region" onSubmit={onSubmit}>
            <label>
              Opening cash (EGP)
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
              Mode of payment
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
              Creates a submitted POS Opening Entry in ERPNext for cashier{' '}
              <strong>{user?.email || user?.name}</strong>.
            </p>
            <Btn type="submit" variant="primary" loading={saving}>
              Open shift
            </Btn>
          </form>
        </LayoutSection>
      )}
    </FormPageLayout>
  );
}
