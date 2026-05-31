import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader, Btn, ApiErrorCard } from '../../components/ui';
import StatusPill from '../../components/approvals/StatusPill';
import { purchaseReceiptApprovalStatus, purchaseReceiptStatusLabel } from '../../utils/approvalStatuses';
import { useAuth } from '../../hooks/useAuth';
import { FormPageLayout, LayoutSection } from '../../components/layout/page-layouts';
import { listSuppliers } from '../../services/purchasingApi';
import {
  createPurchaseReceiptWorkflow,
  getBuyingRateSuggestions,
} from '../../services/purchasingApprovalApi';
import { listWarehouses } from '../../services/inventoryApi';
import { getItems } from '../../services/api';
import { getCompanies } from '../../services/api';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { canAccessPurchasingAdminFinance, canShowPurchasingFinanceGuidance } from '../../auth/navigationConfig';
import { approvalsHubPath, financePath, purchasingPath } from '../../utils/workspacePaths';
import AccessibleLink from '../../components/auth/AccessibleLink';
import {
  approvalLevelLabel,
  evaluatePurchaseApproval,
  pendingReceiptMessage,
  submitButtonLabel,
} from '../../utils/purchasingApproval';
import { fmtCurrency } from '../../utils/format';
import { useNotify } from '../../context/NotificationContext';

const emptyLine = () => ({
  item_code: '',
  qty: '',
  rate: '',
  expected_rate: '',
  previous_rate: '',
  warehouse: '',
  rateTouched: false,
});

export default function ReceiveStockPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const { capabilities } = useAuth();
  const showAdminFinance = canAccessPurchasingAdminFinance(capabilities);
  const showFinanceGuidance = canShowPurchasingFinanceGuidance(capabilities);
  const [searchParams] = useSearchParams();
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [company, setCompany] = useState('');
  const [supplier, setSupplier] = useState(searchParams.get('supplier') || '');
  const [warehouse, setWarehouse] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [lastReceipt, setLastReceipt] = useState(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    listSuppliers({ limit: 300 }).then((r) => setSuppliers(r?.data?.data || []));
    listWarehouses({ limit: 200 }).then((r) => {
      const wh = r?.data?.data || [];
      setWarehouses(wh);
      if (wh[0]) setWarehouse(wh[0].name);
    });
    getItems({ limit: 500 }).then((r) => setItems(r?.data?.data || []));
    getCompanies({ limit: 1 }).then((r) => setCompany(r?.data?.data?.[0]?.name || ''));
  }, []);

  const approvalPreview = useMemo(
    () =>
      evaluatePurchaseApproval(
        lines.map((l) => ({
          item_code: l.item_code,
          qty: l.qty,
          rate: l.rate,
          expected_rate: l.expected_rate,
        })),
      ),
    [lines],
  );

  const orderTotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const qty = Number(line.qty);
        const rate = Number(line.rate);
        if (!Number.isFinite(qty) || !Number.isFinite(rate)) return sum;
        return sum + qty * rate;
      }, 0),
    [lines],
  );

  const lineAmount = (line) => {
    const qty = Number(line.qty);
    const rate = Number(line.rate);
    if (!Number.isFinite(qty) || !Number.isFinite(rate) || qty <= 0 || rate <= 0) return null;
    return qty * rate;
  };

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const fillRateForLine = async (index, itemCode) => {
    const code = (itemCode || '').trim();
    if (!code) return;
    try {
      const suggestions = await getBuyingRateSuggestions([code]);
      const row = suggestions[code];
      const expected = row?.expected_rate ?? 0;
      setLines((prev) =>
        prev.map((line, i) => {
          if (i !== index) return line;
          const next = { ...line, expected_rate: expected };
          if (!line.rateTouched && (line.rate === '' || line.rate == null)) {
            next.rate = expected > 0 ? String(expected) : '';
            next.previous_rate = '';
          }
          return next;
        }),
      );
    } catch {
      /* suggestions optional */
    }
  };

  const onItemBlur = (index, itemCode) => {
    fillRateForLine(index, itemCode);
  };

  const onRateChange = (index, value) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const prevRate = line.rate !== '' ? Number(line.rate) : line.expected_rate;
        return {
          ...line,
          rate: value,
          rateTouched: true,
          previous_rate: line.previous_rate !== '' ? line.previous_rate : prevRate,
        };
      }),
    );
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setErr('');
    setSaving(true);
    try {
      const payloadLines = lines.map((l) => ({
        item_code: l.item_code,
        qty: l.qty,
        rate: l.rate,
        expected_rate: l.expected_rate,
        warehouse: l.warehouse || warehouse,
        previous_rate:
          l.rateTouched && l.previous_rate !== '' ? l.previous_rate : undefined,
      }));
      const result = await createPurchaseReceiptWorkflow({
        supplier,
        company,
        warehouse,
        lines: payloadLines,
      });
      setLastReceipt(result);
      if (result.submitted) {
        notify.success(`Goods received & approved: ${result.name} — stock updated.`);
      } else {
        notify.info(pendingReceiptMessage(result));
      }
      setLines([emptyLine()]);
    } catch (e2) {
      setErr(getUserFriendlyMessage(e2));
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  const submitLabel = submitButtonLabel(approvalPreview);
  const isPurchasingOnly =
    approvalPreview.requiresApproval ||
    submitLabel === 'Submit for approval';

  return (
    <FormPageLayout>
      <PageHeader title={t('purchasing.receiveStock')} subtitle={t('purchasing.receiveStockSubtitle')} dense />
      <LayoutSection variant="raised" flushHead>
        {lastReceipt && !lastReceipt.submitted && (
          <div className="receive-pending-banner card panel" role="status">
            <StatusPill
              status={purchaseReceiptApprovalStatus({
                pending_purchase_approval: 1,
                approval_level: lastReceipt.approval_level,
                approval_status: lastReceipt.approval_status,
              })}
              label={purchaseReceiptStatusLabel({
                pending_purchase_approval: 1,
                approval_level: lastReceipt.approval_level,
                approval_status: lastReceipt.approval_status,
              })}
            />
            <p style={{ margin: '8px 0 0' }}>
              {pendingReceiptMessage(lastReceipt)}
            </p>
            <p className="page-header__sub" style={{ marginTop: 8 }}>
              {showAdminFinance && (
                <>
                  {t('purchasing.trackStatusIn')}{' '}
                  <AccessibleLink to={purchasingPath('reports')}>{t('purchasing.purchaseHistory')}</AccessibleLink>
                  {capabilities.canViewApprovalsDashboard ? (
                    <>
                      {' '}
                      {t('common.or')} <AccessibleLink to={approvalsHubPath(capabilities)}>{t('nav.approvals')}</AccessibleLink>
                    </>
                  ) : null}
                  .
                </>
              )}
              {!showAdminFinance && capabilities.canViewApprovalsDashboard && (
                <>
                  {t('purchasing.trackStatusIn')}{' '}
                  <AccessibleLink to={approvalsHubPath(capabilities)}>{t('nav.approvals')}</AccessibleLink>.
                </>
              )}
            </p>
          </div>
        )}
        <form className="inv-form form-region" onSubmit={onSubmit}>
          <label>
            {t('purchasing.table.supplier')}
            <select className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} required>
              <option value="">{t('purchasing.selectSupplier')}</option>
              {suppliers.map((s) => (
                <option key={s.name} value={s.name}>{s.supplier_name || s.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t('purchasing.receivingWarehouse')}
            <select className="input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} required>
              {warehouses.map((w) => (
                <option key={w.name} value={w.name}>{w.warehouse_name || w.name}</option>
              ))}
            </select>
          </label>
          {showFinanceGuidance && (
            <p className="page-header__sub" style={{ marginBottom: 12 }}>
              After manager approval, supplier payables are created automatically. Use{' '}
              <AccessibleLink to={financePath('matching')}>Invoice matching</AccessibleLink> only for variance or partial billing.
            </p>
          )}

          {approvalPreview.requiresApproval && (
            <p className="receive-approval-hint" role="status">
              Buying rate variance up to {approvalPreview.maxVariancePct}% —{' '}
              {approvalLevelLabel(approvalPreview.level)} required.
              {approvalPreview.level === 'accountant'
                ? ' After you submit, an accountant must approve before stock is updated.'
                : ' After you submit, a store manager must approve before stock is updated.'}
            </p>
          )}
          {!approvalPreview.requiresApproval && isPurchasingOnly && (
            <p className="receive-approval-hint" role="status">
              Rates match expected buying prices — receipt will submit immediately when received.
            </p>
          )}

          <p className="section-title">{t('purchasing.lineItems')}</p>
          <div className="receive-line receive-line--head" aria-hidden="true">
            <span>{t('inventory.stockEntry.item')}</span>
            <span>{t('inventory.stockEntry.qty')}</span>
            <span>{t('purchasing.rate')}</span>
            <span>{t('purchasing.lineTotal')}</span>
            <span />
          </div>
          {lines.map((line, index) => {
            const amount = lineAmount(line);
            const qtyNum = Number(line.qty);
            const rateNum = Number(line.rate);
            return (
            <div key={index} className="receive-line">
              <input
                className="input"
                list="receive-items"
                placeholder={t('inventory.stockEntry.itemCode')}
                value={line.item_code}
                onChange={(e) => updateLine(index, { item_code: e.target.value })}
                onBlur={(e) => onItemBlur(index, e.target.value)}
                required
              />
              <input
                className="input"
                type="number"
                min="0.001"
                step="any"
                placeholder={t('inventory.stockEntry.qty')}
                value={line.qty}
                onChange={(e) => updateLine(index, { qty: e.target.value })}
                required
              />
              <div>
                <input
                  className="input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder={t('purchasing.buyingRate')}
                  value={line.rate}
                  onChange={(e) => onRateChange(index, e.target.value)}
                  required
                />
                {line.expected_rate !== '' && Number(line.expected_rate) > 0 && (
                  <p className="receive-line-expected">
                    {t('purchasing.expected')} {Number(line.expected_rate).toFixed(2)}
                  </p>
                )}
              </div>
              <div className="receive-line-total" aria-live="polite">
                {amount != null ? (
                  <>
                    <span className="receive-line-total__value">{fmtCurrency(amount)}</span>
                    <span className="receive-line-total__formula">
                      {qtyNum} × {rateNum}
                    </span>
                  </>
                ) : (
                  <span className="receive-line-total__placeholder">—</span>
                )}
              </div>
              {lines.length > 1 ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLines((p) => p.filter((_, i) => i !== index))}>{t('common.remove')}</button>
              ) : (
                <span />
              )}
            </div>
            );
          })}
          <p className="receive-order-total">
            {t('purchasing.orderTotal')}: <strong>{fmtCurrency(orderTotal)}</strong>
          </p>
          <datalist id="receive-items">{items.map((it) => <option key={it.item_code} value={it.item_code} />)}</datalist>
          <Btn type="button" variant="ghost" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>+ {t('purchasing.addLine')}</Btn>
          <Btn type="submit" variant="primary" size="md" loading={saving}>{submitLabel}</Btn>
        </form>
        {err && <ApiErrorCard title={t('purchasing.receiveFailed')} message={err} />}
      </LayoutSection>
    </FormPageLayout>
  );
}
