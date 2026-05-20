import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { getPOSInvoice } from '../services/api';
import { checkoutPOSInvoice, retrySubmitPOSInvoice } from '../services/posCheckout';
import {
  resolveActivePOSProfile,
  searchPOSItems,
  refreshItemStock,
  fetchItemBinsAcrossWarehouses,
  getPOSPaymentModes,
  getShiftMetrics,
  setStoredPOSProfile,
} from '../services/posApi';
import { getOpenPOSOpeningEntry } from '../services/shiftsApi';
import { openShift as openShiftService } from '../services/shiftsService';
import {
  validateCartStock,
  canAddToCart,
  validateLineStock,
  firstCartAlternateHint,
} from '../utils/posStock';
import {
  formatPosStockErrorMessage,
  getUserFriendlyMessage,
  normalizeERPError,
} from '../utils/errorHandling';
import { invalidateStockCache, STOCK_INVALIDATE_EVENT } from '../utils/stockCache';
import { getPOSProfileWarehouse } from '../services/stockService';

export function usePOS(user) {
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);

  const [shift, setShift] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftError, setShiftError] = useState(null);

  const [paymentModes, setPaymentModes] = useState([]);

  const [items, setItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [productsError, setProductsError] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const [cartWarning, setCartWarning] = useState('');
  const [stockIssues, setStockIssues] = useState([]);
  const [lastInvoice, setLastInvoice] = useState(null);
  const [pendingInvoice, setPendingInvoice] = useState(null);
  const [metrics, setMetrics] = useState({ sales: 0, invoiceCount: 0, averageOrder: 0 });

  const searchRef = useRef(null);
  const profileRef = useRef(null);
  const shiftRef = useRef(null);
  const cartRef = useRef([]);
  const checkoutInFlightRef = useRef(false);

  profileRef.current = profile;
  shiftRef.current = shift;
  cartRef.current = cart;

  const refreshMetrics = useCallback(async () => {
    const p = profileRef.current;
    const s = shiftRef.current;
    if (!p) return;
    const fromDate = s?.posting_date || s?.period_start_date || new Date().toISOString().slice(0, 10);
    const m = await getShiftMetrics({
      posProfile: p.name,
      fromDate: String(fromDate).slice(0, 10),
      owner: user?.name,
    });
    setMetrics(m);
  }, [user?.name]);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const p = await resolveActivePOSProfile();
      // Warehouse consistency: always resolve warehouse from backend POS Profile warehouse.
      try {
        const wh = await getPOSProfileWarehouse(p.name);
        if (wh) p.warehouse = wh;
      } catch {
        // Fail-closed handled later by stock reads returning unavailable.
      }
      setProfile(p);
      setStoredPOSProfile(p.name);
      const modes = await getPOSPaymentModes(p);
      setPaymentModes(modes);
      return p;
    } catch (e) {
      setProfile(null);
      setProfileError(getUserFriendlyMessage(e));
      throw e;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const refreshShift = useCallback(async (p = profileRef.current) => {
    if (!p) return null;
    setShiftLoading(true);
    setShiftError(null);
    try {
      const open = await getOpenPOSOpeningEntry(p.name, user?.name);
      setShift(open);
      shiftRef.current = open;
      if (open) await refreshMetrics();
      return open;
    } catch (e) {
      setShiftError(getUserFriendlyMessage(e));
      setShift(null);
      return null;
    } finally {
      setShiftLoading(false);
    }
  }, [user?.name, refreshMetrics]);

  const openShift = useCallback(async ({ openingAmount = 0, modeOfPayment = 'Cash' } = {}) => {
    const p = profileRef.current;
    if (!p) throw new Error('POS Profile not loaded');
    setShiftLoading(true);
    setShiftError(null);
    try {
      const entry = await openShiftService({
        posProfile: p.name,
        company: p.company,
        openingAmount,
        modeOfPayment,
        user: user?.name,
        canOpen: true,
      });
      setShift(entry);
      shiftRef.current = entry;
      await refreshMetrics();
      return entry;
    } catch (e) {
      setShiftError(getUserFriendlyMessage(e));
      throw e;
    } finally {
      setShiftLoading(false);
    }
  }, [user?.name, refreshMetrics]);

  const closeShift = useCallback(async () => {
    const s = shiftRef.current;
    if (!s?.name) throw new Error('No open shift');
    return { redirectTo: `/shifts/close?opening=${encodeURIComponent(s.name)}` };
  }, []);

  const loadItems = useCallback(async (q = '') => {
    const p = profileRef.current;
    if (!p) return;
    setLoading(true);
    setProductsError(null);
    try {
      const rows = await searchPOSItems({
        query: q,
        warehouse: p.warehouse,
        priceList: p.selling_price_list,
        limit: 80,
      });
      setItems(rows);
      setCart((prev) => {
        const byCode = new Map(rows.map((r) => [r.item_code, r.sellable_qty]));
        return prev.map((line) =>
          byCode.has(line.item_code) ? { ...line, sellable_qty: byCode.get(line.item_code) } : line,
        );
      });
    } catch (e) {
      setProductsError(getUserFriendlyMessage(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveItemByScan = useCallback(async (barcode) => {
    const p = profileRef.current;
    if (!p) return null;
    const rows = await searchPOSItems({
      query: barcode,
      warehouse: p.warehouse,
      priceList: p.selling_price_list,
      limit: 1,
    });
    return rows[0] || null;
  }, []);

  const syncCartStock = useCallback(async (cartLines) => {
    const p = profileRef.current;
    if (!p?.warehouse) return cartLines;
    const updated = await Promise.all(
      cartLines.map(async (line) => {
        if (line.is_stock_item === false) return line;
        const qty = await refreshItemStock(line.item_code, p.warehouse);
        return { ...line, sellable_qty: qty };
      })
    );
    return updated;
  }, []);

  const addToCart = useCallback(async (item, { qty = 1 } = {}) => {
    setCartWarning('');
    setCheckoutError(null);
    const wh = profileRef.current?.warehouse || '';
    let liveItem = item;
    if (wh && item.item_code && item.is_stock_item !== false) {
      try {
        const freshQty = await refreshItemStock(item.item_code, wh);
        liveItem = { ...item, sellable_qty: freshQty, pos_warehouse: wh };
        setItems((prev) =>
          prev.map((row) =>
            row.item_code === item.item_code ? { ...row, sellable_qty: freshQty } : row
          )
        );
      } catch {
        /* use last known qty */
      }
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.item_code === item.item_code);
      const nextQty = (existing?.qty || 0) + qty;
      const check = canAddToCart(
        { ...liveItem, sellable_qty: liveItem.sellable_qty },
        existing?.qty || 0,
        wh
      );
      if (!check.ok && qty > 0) {
        setCartWarning(check.message);
        return prev;
      }
      if (existing) {
        return prev.map((c) =>
          c.item_code === item.item_code
            ? {
                ...c,
                qty: nextQty,
                rate: liveItem.standard_rate ?? c.rate,
                sellable_qty: liveItem.sellable_qty,
              }
            : c
        );
      }
      return [
        ...prev,
        {
          ...liveItem,
          qty: Math.max(1, qty),
          rate: liveItem.standard_rate || 0,
        },
      ];
    });
  }, []);

  const removeFromCart = useCallback((item_code) => {
    setCartWarning('');
    setCart((prev) => prev.filter((c) => c.item_code !== item_code));
  }, []);

  const updateQty = useCallback((item_code, qty) => {
    setCartWarning('');
    if (qty <= 0) {
      removeFromCart(item_code);
      return;
    }
    setCart((prev) => {
      const line = prev.find((c) => c.item_code === item_code);
      if (!line) return prev;
      const issue = validateLineStock(line, qty, profileRef.current?.warehouse || '');
      if (issue) {
        setCartWarning(issue.message);
        if (issue.available != null && issue.available > 0) {
          return prev.map((c) => (c.item_code === item_code ? { ...c, qty: issue.available } : c));
        }
        return prev;
      }
      return prev.map((c) => (c.item_code === item_code ? { ...c, qty } : c));
    });
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setCart([]);
    setCartWarning('');
    setStockIssues([]);
    setCheckoutError(null);
  }, []);

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.qty * i.rate, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

  const buildPayments = useCallback((paymentState, total) => {
    const t = Number(total.toFixed(2));
    if (paymentState.mode === 'split') {
      const cash = Number(paymentState.cashAmount) || 0;
      const card = Number(paymentState.cardAmount) || 0;
      const sum = cash + card;
      if (Math.abs(sum - t) > 0.02) {
        throw new Error(`Split payments must equal ${t.toFixed(2)} EGP`);
      }
      const rows = [];
      if (cash > 0) rows.push({ mode_of_payment: paymentState.cashMode || 'Cash', amount: cash });
      if (card > 0) rows.push({ mode_of_payment: paymentState.cardMode || 'Card', amount: card });
      return rows;
    }
    return [{ mode_of_payment: paymentState.singleMode || 'Cash', amount: t }];
  }, []);

  const buildCheckoutStockMessage = useCallback((normalized, cartLines, binsByItem, warehouse) => {
    if (!normalized?.isStockError) return getUserFriendlyMessage(normalized);
    const hint = firstCartAlternateHint(cartLines, binsByItem, warehouse);
    normalized.stockHint = hint;
    normalized.posWarehouse = warehouse;
    return formatPosStockErrorMessage(normalized, { fallbackWarehouse: warehouse, hint });
  }, []);

  const checkout = useCallback(
    async ({ customer, paymentState, invoiceExtras = {} } = {}) => {
      if (checkoutInFlightRef.current) return null;

      const p = profileRef.current;
      const s = shiftRef.current;
      if (!p) throw new Error('POS Profile not loaded');
      if (!s || s.status !== 'Open') {
        throw new Error('Open a shift before checkout (Start Shift).');
      }
      if (!cart.length) return null;

      checkoutInFlightRef.current = true;
      setCheckoutError(null);
      setCheckoutLoading(true);

      let cartSnapshot = cart;
      let binsByItem = new Map();

      try {
        cartSnapshot = await syncCartStock(cartSnapshot);
        setCart(cartSnapshot);

        binsByItem = await fetchItemBinsAcrossWarehouses(cartSnapshot.map((i) => i.item_code));
        const issues = validateCartStock(cartSnapshot, p.warehouse, binsByItem);
        setStockIssues(issues);
        if (issues.length) {
          const err = new Error(issues.map((i) => `${i.item_code}: ${i.message}`).join('; '));
          err.isStockError = true;
          err.posWarehouse = p.warehouse;
          err.stockHint = firstCartAlternateHint(cartSnapshot, binsByItem, p.warehouse);
          throw err;
        }

        setPendingInvoice(null);

        const payments = buildPayments(paymentState, cartTotal);
        const payload = {
          customer: customer || p.defaultCustomer || 'Walk-in Customer',
          company: p.company,
          pos_profile: p.name,
          pos_opening_entry: s.name,
          set_warehouse: p.warehouse,
          // Critical: stock must be updated by ERP on submit.
          update_stock: 1,
          selling_price_list: p.selling_price_list,
          currency: p.currency,
          is_pos: 1,
          items: cartSnapshot.map((i) => ({
            item_code: i.item_code,
            item_name: i.item_name,
            qty: i.qty,
            rate: i.rate,
            uom: i.stock_uom || 'Nos',
            warehouse: p.warehouse,
          })),
          payments,
          ...invoiceExtras,
        };

        const invoice = await checkoutPOSInvoice(payload);
        setCheckoutError(null);
        setLastInvoice(invoice);
        clearCart();
        invalidateStockCache({ source: 'pos_checkout', warehouse: p.warehouse });
        await refreshMetrics();
        await loadItems(query);
        return invoice;
      } catch (e) {
        const normalized = e?.isNormalized ? e : normalizeERPError(e);
        if (!normalized.isStockError && e?.isStockError) {
          normalized.isStockError = true;
        }
        normalized.posWarehouse = p.warehouse;
        if (normalized.isStockError) {
          setPendingInvoice(null);
          const msg = buildCheckoutStockMessage(normalized, cartSnapshot, binsByItem, p.warehouse);
          setCheckoutError(msg);
          normalized.message = msg;
        } else if (normalized.recoverable && normalized.invoiceName) {
          setPendingInvoice(normalized.invoiceName);
          const msg = getUserFriendlyMessage(normalized);
          setCheckoutError(msg);
        } else {
          setPendingInvoice(null);
          setCheckoutError(getUserFriendlyMessage(normalized));
        }
        throw normalized;
      } finally {
        checkoutInFlightRef.current = false;
        setCheckoutLoading(false);
      }
    },
    [cart, cartTotal, clearCart, buildPayments, syncCartStock, refreshMetrics, loadItems, query, buildCheckoutStockMessage]
  );

  const recoverPendingInvoice = useCallback(async () => {
    if (!pendingInvoice || checkoutInFlightRef.current) return null;
    checkoutInFlightRef.current = true;
    setCheckoutLoading(true);
    setCheckoutError(null);
    const wh = profileRef.current?.warehouse || '';
    try {
      const doc = await retrySubmitPOSInvoice(pendingInvoice, { posWarehouse: wh });
      setCheckoutError(null);
      setLastInvoice(doc);
      setPendingInvoice(null);
      clearCart();
      await refreshMetrics();
      return doc;
    } catch (e) {
      const normalized = e?.isNormalized ? e : normalizeERPError(e);
      normalized.posWarehouse = wh;
      if (normalized.isStockError) {
        setPendingInvoice(null);
        const msg = buildCheckoutStockMessage(normalized, cart, null, wh);
        setCheckoutError(msg);
        normalized.message = msg;
      } else {
        setCheckoutError(getUserFriendlyMessage(normalized));
      }
      throw normalized;
    } finally {
      checkoutInFlightRef.current = false;
      setCheckoutLoading(false);
    }
  }, [pendingInvoice, cart, clearCart, refreshMetrics, buildCheckoutStockMessage]);

  const dismissPendingInvoice = useCallback(async () => {
    if (!pendingInvoice) return;
    try {
      const res = await getPOSInvoice(pendingInvoice);
      setLastInvoice(res?.data?.data || { name: pendingInvoice });
    } catch {
      setLastInvoice({ name: pendingInvoice });
    }
    setPendingInvoice(null);
    clearCart();
  }, [pendingInvoice, clearCart]);

  const init = useCallback(async () => {
    const p = await loadProfile();
    await refreshShift(p);
    await loadItems();
    return p;
  }, [loadProfile, refreshShift, loadItems]);

  useEffect(() => {
    const onInvalidate = () => {
      loadItems(query);
      if (cart.length) {
        syncCartStock(cart).then(setCart);
      }
    };
    window.addEventListener(STOCK_INVALIDATE_EVENT, onInvalidate);
    return () => window.removeEventListener(STOCK_INVALIDATE_EVENT, onInvalidate);
  }, [loadItems, query, cart, syncCartStock]);

  const shiftOpen = Boolean(
    shift &&
      !shift.pendingClose &&
      shift.docstatus === 1 &&
      (shift.status === 'Open' || shift.status == null || shift.status === undefined)
  );

  return {
    profile,
    profileLoading,
    profileError,
    shift,
    shiftOpen,
    shiftLoading,
    shiftError,
    paymentModes,
    metrics,
    items,
    cart,
    query,
    setQuery,
    loading,
    checkoutLoading,
    productsError,
    checkoutError,
    cartWarning,
    stockIssues,
    lastInvoice,
    setLastInvoice,
    pendingInvoice,
    searchRef,
    init,
    loadProfile,
    refreshShift,
    openShift,
    closeShift,
    loadItems,
    resolveItemByScan,
    addToCart,
    removeFromCart,
    updateQty,
    clearCart,
    cartTotal,
    cartCount,
    checkout,
    recoverPendingInvoice,
    dismissPendingInvoice,
    refreshMetrics,
  };
}
