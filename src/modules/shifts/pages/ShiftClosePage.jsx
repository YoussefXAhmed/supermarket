import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiErrorCard, Btn, PageHeader, PageLoading } from '../../../components/ui';
import { FormPageLayout, LayoutSection } from '../../../components/layout/page-layouts';
import { useAuth } from '../../../hooks/useAuth';
import {
  loadShiftSummary,
  closeShift,
  resolveShiftContext,
} from '../../../services/shiftsService';
import { calculateVariance } from '../../../utils/shiftCalculations';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import ShiftSummaryCard from '../components/ShiftSummaryCard';
import CashCountForm from '../components/CashCountForm';
import VarianceBanner from '../components/VarianceBanner';
import ShiftStatusBadge from '../components/ShiftStatusBadge';

export default function ShiftClosePage() {
  const { t } = useTranslation();
  const { user, canCloseShift, canApproveShift } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const openingParam = searchParams.get('opening');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [summary, setSummary] = useState(null);
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const ctx = await resolveShiftContext({ user: user?.name });
      const openingName = openingParam || ctx.activeShift?.name;
      if (!openingName) {
        setSummary(null);
        return;
      }
      const data = await loadShiftSummary(openingName);
      setSummary(data);
      setActualCash(String(data.expectedCash ?? ''));
    } catch (e) {
      setSummary(null);
      setError(getUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [openingParam, user?.name]);

  useEffect(() => {
    load();
  }, [load]);

  const preview =
    actualCash !== '' && summary
      ? calculateVariance(summary.expectedCash, actualCash)
      : null;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canCloseShift || saving || !summary?.opening?.name) return;
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const result = await closeShift({
        openingEntryName: summary.opening.name,
        actualCash,
        notes,
        operator: user?.email || user?.name,
        canClose: canCloseShift,
        canSubmitClosing: canApproveShift,
      });
      if (result.submitted) {
        setMsg(`${t('shifts.closeShift')} — ${result.closing?.name} submitted in ERPNext.`);
        setTimeout(() => navigate('/pos'), 1500);
      } else if (result.needsVarianceApproval) {
        setMsg(
          `${result.closing?.name} saved as draft — manager must approve variance (EGP ${result.variance.variance.toFixed(2)}).`,
        );
      } else if (result.needsManagerSubmit) {
        setMsg(
          `${result.closing?.name} saved as draft — a store manager must submit it in ERPNext.`,
        );
      } else {
        setMsg(result.message || 'Closing draft saved — check ERPNext Desk.');
      }
    } catch (e2) {
      setError(getUserFriendlyMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  if (!canCloseShift) {
    return (
      <FormPageLayout>
        <PageHeader title={t('shifts.closeShift')} subtitle={t('shifts.accessDenied')} dense />
        <ApiErrorCard message={t('shifts.closeShiftPermission')} />
      </FormPageLayout>
    );
  }

  return (
    <FormPageLayout>
      <PageHeader
        title={t('shifts.closeShift')}
        subtitle={t('shifts.cashReconciliationVsErp')}
        dense
        actions={
          <Link to="/pos" className="btn btn--ghost btn--sm">
            {t('common.pos')}
          </Link>
        }
      />

      {loading ? (
        <PageLoading size={26} />
      ) : !summary?.opening ? (
        <LayoutSection variant="raised">
          <p className="page-header__sub">{t('shifts.noOpenShift')}</p>
          <Link to="/shifts/open" className="btn btn--primary btn--sm">
            {t('shifts.openShift')}
          </Link>
        </LayoutSection>
      ) : (
        <>
          <LayoutSection variant="raised" title={t('shifts.shiftStatus')} flushHead>
            <div className="toolbar">
              <ShiftStatusBadge status={summary.opening.status} docstatus={summary.opening.docstatus} />
              <span className="mono page-header__sub">{summary.opening.name}</span>
              <span className="page-header__sub">{summary.opening.pos_profile}</span>
            </div>
          </LayoutSection>

          <ShiftSummaryCard summary={summary} opening={summary.opening} />

          {preview && (
            <VarianceBanner
              variance={preview.variance}
              severity={preview.severity}
              expected={preview.expected}
              actual={preview.actual}
            />
          )}

          <LayoutSection variant="raised" title={t('shifts.cashCount')}>
            <CashCountForm
              actualCash={actualCash}
              onActualCashChange={setActualCash}
              notes={notes}
              onNotesChange={setNotes}
              onSubmit={onSubmit}
              loading={saving}
              disabled={!canCloseShift}
            />
            {msg && <p className="inv-success">{msg}</p>}
            {error && <ApiErrorCard message={error} onRetry={load} />}
          </LayoutSection>
        </>
      )}
    </FormPageLayout>
  );
}
