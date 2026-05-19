/** Buying-rate variance thresholds (must match elmahdi.api.purchasing). */
export const MANAGER_VARIANCE_PCT = 10;
export const ACCOUNTANT_VARIANCE_PCT = 20;

export function lineVariancePct(expected, entered) {
  const exp = Number(expected);
  const rate = Number(entered);
  if (!Number.isFinite(exp) || exp <= 0) {
    return rate > 0 ? 100 : 0;
  }
  return (Math.abs(rate - exp) / exp) * 100;
}

export function approvalLevelForVariance(pct) {
  if (pct <= MANAGER_VARIANCE_PCT) return 'none';
  if (pct <= ACCOUNTANT_VARIANCE_PCT) return 'manager';
  return 'accountant';
}

export function evaluatePurchaseApproval(lines) {
  let maxPct = 0;
  const audited = (lines || []).map((line) => {
    const expected = Number(line.expected_rate) || 0;
    const rate = Number(line.rate) || 0;
    const qty = Number(line.qty) || 0;
    const pct = lineVariancePct(expected, rate);
    maxPct = Math.max(maxPct, pct);
    return {
      item_code: line.item_code,
      qty,
      rate,
      expected_rate: expected,
      variance_pct: Math.round(pct * 100) / 100,
      amount: Math.round(qty * rate * 100) / 100,
    };
  });
  const level = approvalLevelForVariance(maxPct);
  return {
    level,
    maxVariancePct: Math.round(maxPct * 100) / 100,
    requiresApproval: level !== 'none',
    lines: audited,
  };
}

export function submitButtonLabel(approval) {
  if (!approval?.requiresApproval) return 'Receive & submit';
  return 'Submit for approval';
}

export function approvalLevelLabel(level) {
  if (level === 'accountant') return 'Accountant approval';
  if (level === 'manager') return 'Manager approval';
  return 'Auto-approved';
}

/** User-facing message after a pending purchase receipt is saved. */
export function pendingReceiptMessage({ name, approval_level: level }) {
  const id = name ? ` ${name}` : '';
  if (level === 'accountant') {
    return (
      `Receipt${id} saved. Waiting for accountant approval — stock will update after approval.`
    );
  }
  return (
    `Receipt${id} saved. Waiting for store manager approval — stock will update after approval.`
  );
}
