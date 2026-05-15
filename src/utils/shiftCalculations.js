/**
 * Shift reconciliation math — derived from ERP invoice aggregates (not authoritative).
 * Authoritative totals remain on POS Closing Entry after ERP submit.
 */

export const VARIANCE_WARNING_THRESHOLD = 5;
export const VARIANCE_APPROVAL_THRESHOLD = 50;

export function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * @param {Array<{ mode_of_payment: string, amount: number }>} payments
 */
export function sumPaymentsByMode(payments = []) {
  const map = new Map();
  for (const row of payments) {
    const mode = row.mode_of_payment || 'Cash';
    map.set(mode, roundMoney((map.get(mode) || 0) + (Number(row.amount) || 0)));
  }
  return Object.fromEntries(map);
}

/**
 * Aggregate shift invoices into operational summary.
 * @param {object} params
 * @param {Array} params.invoices normalized invoice rows
 * @param {Record<string, number>} params.openingByMode opening float by payment mode
 */
export function summarizeShiftInvoices({ invoices = [], openingByMode = {} }) {
  const paymentTotals = {};
  let salesTotal = 0;
  let salesCount = 0;
  let returnsTotal = 0;
  let returnsCount = 0;
  let voidCount = 0;

  for (const inv of invoices) {
    if (inv.docstatus === 2 || inv.is_cancelled) {
      voidCount += 1;
      continue;
    }
    if (inv.docstatus !== 1) continue;

    const total = Number(inv.grand_total) || 0;
    const isReturn = Boolean(inv.is_return) || total < 0;

    if (isReturn) {
      returnsTotal = roundMoney(returnsTotal + Math.abs(total));
      returnsCount += 1;
    } else {
      salesTotal = roundMoney(salesTotal + total);
      salesCount += 1;
    }

    const pays = inv.payments?.length
      ? inv.payments
      : [{ mode_of_payment: inv.default_mode_of_payment || 'Cash', amount: total }];

    for (const p of pays) {
      const mode = p.mode_of_payment || 'Cash';
      const amt = Number(p.amount) || 0;
      const signed = isReturn ? -Math.abs(amt) : amt;
      paymentTotals[mode] = roundMoney((paymentTotals[mode] || 0) + signed);
    }
  }

  const openingCash = roundMoney(openingByMode.Cash ?? openingByMode.cash ?? 0);
  const netCashFromSales = roundMoney(paymentTotals.Cash ?? paymentTotals.cash ?? 0);
  const expectedCash = roundMoney(openingCash + netCashFromSales);

  const cardModes = Object.entries(paymentTotals).filter(
    ([mode]) => !/^cash$/i.test(mode),
  );
  const cardTotal = roundMoney(cardModes.reduce((s, [, v]) => s + v, 0));

  return {
    salesTotal,
    salesCount,
    returnsTotal,
    returnsCount,
    voidCount,
    invoiceCount: salesCount + returnsCount,
    paymentTotals,
    openingCash,
    netCashFromSales,
    expectedCash,
    cardTotal,
  };
}

export function calculateVariance(expectedCash, actualCash) {
  const expected = roundMoney(expectedCash);
  const actual = roundMoney(actualCash);
  const variance = roundMoney(actual - expected);
  const absVariance = Math.abs(variance);

  let severity = 'ok';
  if (absVariance >= VARIANCE_APPROVAL_THRESHOLD) severity = 'approval_required';
  else if (absVariance >= VARIANCE_WARNING_THRESHOLD) severity = 'warning';

  return { expected, actual, variance, absVariance, severity };
}

export function buildPaymentReconciliationRows({
  openingByMode = {},
  paymentTotals = {},
  actualByMode = {},
}) {
  const modes = new Set([
    ...Object.keys(openingByMode),
    ...Object.keys(paymentTotals),
    ...Object.keys(actualByMode),
    'Cash',
  ]);

  return [...modes].filter(Boolean).map((mode) => {
    const opening = roundMoney(openingByMode[mode] || 0);
    const expected = roundMoney(opening + (paymentTotals[mode] || 0));
    const closing = roundMoney(actualByMode[mode] ?? (mode === 'Cash' ? actualByMode.Cash : 0) ?? expected);
    return {
      mode_of_payment: mode,
      opening_amount: opening,
      expected_amount: expected,
      closing_amount: closing,
      difference: roundMoney(closing - expected),
    };
  });
}
