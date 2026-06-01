import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePOS } from '../../hooks/usePOS';
import { useAuth } from '../../hooks/useAuth';
import { useGuardedLogout } from '../../hooks/useGuardedLogout';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { getCustomers, getMyPOSInvoices, getPOSInvoice } from '../../services/api';
import {
  Btn,
  Spinner,
  SearchInput,
  EmptyState,
  PageLoading,
  ApiErrorCard,
  ConfirmDialog,
} from '../../components/ui';
import UserSessionActions from '../../components/layout/UserSessionActions';
import POSThermalReceipt from '../../components/pos/POSThermalReceipt';
import POSShiftBar from '../../components/pos/POSShiftBar';
import POSPaymentPanel from '../../components/pos/POSPaymentPanel';
import POSMetricsBar from '../../components/pos/POSMetricsBar';
import { getERPImageUrl } from '../../utils/erpLinks';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { useNotify } from '../../context/NotificationContext';
import { availableQty } from '../../utils/posStock';
import { getPOSSessionLinks } from '../../auth/navigationConfig';
import '../../styles/pos.css';

const DEFAULT_PAYMENT = { mode: 'cash', singleMode: 'Cash', cashAmount: '', cardAmount: '', cashMode: 'Cash', cardMode: 'Card' };

function stockLabel(item, t) {
  const avail = availableQty(item);
  if (avail === null) return null;
  if (avail <= 0) return { text: t('pos.outOfStock'), className: 'item-card__stock--out' };
  if (avail < 5) return { text: t('pos.leftInStock', { count: avail }), className: 'item-card__stock--low' };
  return { text: t('pos.inStock', { count: avail }), className: 'item-card__stock--ok' };
}

function ItemCard({ item, onAdd, disabled }) {
  const { t } = useTranslation();
  const img = getERPImageUrl(item.image);
  const stock = stockLabel(item, t);
  const out = stock?.className === 'item-card__stock--out';
  return (
    <button
      type="button"
      className={`item-card ${out ? 'item-card--out' : ''}`}
      onClick={() => onAdd(item)}
      disabled={disabled || out}
    >
      <div className="item-card__img">
        {img ? <img src={img} alt={item.item_name} /> : <span className="item-card__placeholder">🛒</span>}
      </div>
      <div className="item-card__body">
        <p className="item-card__name" title={item.item_name}>{item.item_name}</p>
        {stock && (
          <span className={`item-card__stock ${stock.className}`}>{stock.text}</span>
        )}
        <div className="item-card__foot">
          <span className="item-card__price">EGP {(item.standard_rate || 0).toFixed(2)}</span>
          {!out && (
            <span className="item-card__add" aria-hidden>+</span>
          )}
        </div>
      </div>
    </button>
  );
}

function CartRow({ item, onQty, onRemove, maxQty }) {
  const { t } = useTranslation();
  const avail = availableQty(item);
  // Stock badge: not color-only — pair every level with a glyph so colorblind
  // users see the same signal cashiers see at a glance.
  let stockClass = '';
  let stockGlyph = '';
  if (avail !== null) {
    if (avail <= 0) { stockClass = 'cart-row__stock--out'; stockGlyph = '⚠'; }
    else if (avail < 5) { stockClass = 'cart-row__stock--low'; stockGlyph = '!'; }
    else { stockClass = 'cart-row__stock--ok'; stockGlyph = '✓'; }
  }
  return (
    <div className="cart-row">
      <div className="cart-row__info">
        <p className="cart-row__name">{item.item_name}</p>
        <p className="cart-row__rate">{t('pos.rateEach', { rate: item.rate.toFixed(2) })}</p>
        {avail !== null && (
          <span className={`cart-row__stock ${stockClass}`}>
            <span aria-hidden="true">{stockGlyph}</span>
            {t('pos.available', { count: avail })}
          </span>
        )}
      </div>
      <div className="cart-row__qty">
        <button type="button" className="cart-row__qty-btn" aria-label="Decrease" onClick={() => onQty(item.item_code, item.qty - 1)}>−</button>
        <input
          className="cart-row__qty-input"
          type="number"
          min="1"
          max={maxQty ?? undefined}
          value={item.qty}
          onChange={(e) => onQty(item.item_code, Number(e.target.value))}
        />
        <button type="button" className="cart-row__qty-btn" aria-label="Increase" onClick={() => onQty(item.item_code, item.qty + 1)}>+</button>
      </div>
      <p className="cart-row__total">EGP {(item.qty * item.rate).toFixed(2)}</p>
      <button type="button" className="cart-row__remove" aria-label="Remove" onClick={() => onRemove(item.item_code)}>✕</button>
    </div>
  );
}

export default function POSPage() {
  const { t } = useTranslation();
  const {
    canOperatePOS,
    canManageShift,
    canMonitorCashiers,
    capabilities,
    user,
  } = useAuth();
  const navigate = useNavigate();
  const notify = useNotify();
  const pos = usePOS(user);
  const { requestLogout, guardModal } = useGuardedLogout();

  const posSessionLinks = useMemo(
    () => getPOSSessionLinks(capabilities).map((link) => ({
      label: t(link.labelKey),
      onClick: () => navigate(link.to),
    })),
    [capabilities, navigate, t],
  );

  const handleEndShift = useCallback(async () => {
    try {
      const result = await pos.closeShift();
      if (result?.redirectTo) navigate(result.redirectTo);
    } catch (e) {
      notify.error(getUserFriendlyMessage(e));
    }
  }, [pos, navigate, notify]);

  const [customer, setCustomer] = useState('Walk-in Customer');
  const [customers, setCustomers] = useState([]);
  const [checkoutErr, setCheckoutErr] = useState('');
  const [payment, setPayment] = useState(DEFAULT_PAYMENT);
  const [myInvoices, setMyInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceLoadingId, setInvoiceLoadingId] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [viewMode, setViewMode] = useState('sell');

  useEffect(() => {
    if (!canOperatePOS && viewMode === 'sell') setViewMode('invoices');
  }, [canOperatePOS, viewMode]);
  const [showReceipt, setShowReceipt] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [initError, setInitError] = useState('');
  const initDone = useRef(false);

  useBarcodeScanner({
    enabled: viewMode === 'sell' && pos.shiftOpen,
    onScan: async (code) => {
      try {
        const item = await pos.resolveItemByScan(code);
        if (item) pos.addToCart(item);
        else setCheckoutErr(t('pos.noBarcodeProduct', { code }));
      } catch (e) {
        setCheckoutErr(getUserFriendlyMessage(e));
      }
    },
  });

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    (async () => {
      try {
        await pos.init();
        getCustomers({ limit: 500 })
          .then((res) => setCustomers(res.data.data || []))
          .catch(() => setCustomers([]));
      } catch (e) {
        setInitError(getUserFriendlyMessage(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (pos.profile?.defaultCustomer) setCustomer(pos.profile.defaultCustomer);
  }, [pos.profile?.defaultCustomer]);

  // If the cashier's shift was closed elsewhere (admin from ERPNext, another
  // tab), clear the cart and send them to the shift-open screen.
  useEffect(() => {
    if (!pos.shiftClosedExternally) return;
    pos.clearCart?.();
    notify.warning(
      t('pos.shiftClosedExternally', {
        defaultValue:
          'Your shift was closed elsewhere. Open a new shift to continue selling.',
      }),
    );
    pos.acknowledgeShiftClosedExternally?.();
    if (canOperatePOS) navigate('/shifts/open');
  }, [pos.shiftClosedExternally, pos.acknowledgeShiftClosedExternally, pos.clearCart, notify, t, navigate, canOperatePOS]);

  useEffect(() => {
    if (pos.paymentModes?.length) {
      const cash = pos.paymentModes.find((m) => /cash/i.test(m.name))?.name || pos.paymentModes[0].name;
      setPayment((p) => ({ ...p, singleMode: cash, cashMode: cash }));
    }
  }, [pos.paymentModes]);

  const loadMyInvoices = useCallback(async () => {
    if (!user?.name) return;
    setInvoicesLoading(true);
    try {
      const res = await getMyPOSInvoices(user.name, { limit: 25 });
      setMyInvoices(res.data.data || []);
    } catch {
      setMyInvoices([]);
    } finally {
      setInvoicesLoading(false);
    }
  }, [user?.name]);

  useEffect(() => {
    loadMyInvoices();
  }, [loadMyInvoices, pos.lastInvoice]);

  // Live "remaining on shelf" — subtract cart-reserved quantities from the
  // backend sellable_qty so the cashier sees stock drop in real time as items
  // are added. The authoritative count still re-syncs on next backend fetch.
  const shelfItems = useMemo(() => {
    if (!pos.items?.length) return pos.items || [];
    const reserved = new Map();
    for (const line of pos.cart || []) {
      reserved.set(line.item_code, (reserved.get(line.item_code) || 0) + Number(line.qty || 0));
    }
    if (reserved.size === 0) return pos.items;
    return pos.items.map((item) => {
      const r = reserved.get(item.item_code);
      if (!r || item.sellable_qty == null) return item;
      return { ...item, sellable_qty: Math.max(0, Number(item.sellable_qty) - r) };
    });
  }, [pos.items, pos.cart]);

  // When the search/filter returns only out-of-stock items, surface a banner
  // so the cashier knows nothing in view is sellable.
  const allOutOfStock = useMemo(() => {
    if (!shelfItems?.length) return false;
    return shelfItems.every((item) => {
      const avail = availableQty(item);
      return avail !== null && avail <= 0;
    });
  }, [shelfItems]);

  useEffect(() => {
    if (pos.lastInvoice?.name) {
      setSelectedInvoice(pos.lastInvoice);
      setShowReceipt(true);
      setViewMode('invoices');
    }
  }, [pos.lastInvoice]);

  useEffect(() => {
    const onKey = (e) => {
      if (viewMode !== 'sell') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        if (e.key === 'F9') e.preventDefault();
        else return;
      }
      if (e.key === 'F2' && pos.shiftOpen && pos.cart.length) {
        e.preventDefault();
        handleCheckout();
      }
      if (e.key === 'Escape' && pos.cart.length) {
        e.preventDefault();
        handleClearCart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const handleSearch = useCallback(async (q) => {
    pos.setQuery(q);
    await pos.loadItems(q);
  }, [pos]);

  const handleClearCart = () => {
    if (!pos.cart.length) return;
    setConfirmClear(true);
  };

  const handleCheckout = async () => {
    setCheckoutErr('');
    if (!pos.shiftOpen) {
      setCheckoutErr(t('pos.startShiftBeforeCheckout'));
      return;
    }
    try {
      const selected = customers.find((c) => c.name === customer);
      const nationalId = selected?.national_id || selected?.custom_national_id || selected?.tax_id || '';
      const invoice = await pos.checkout({
        customer,
        paymentState: payment,
        invoiceExtras: nationalId
          ? { national_id: nationalId, custom_national_id: nationalId, tax_id: nationalId }
          : {},
      });
      notify.success(t('pos.saleComplete', { name: invoice?.name || t('pos.invoiceSubmitted') }));
    } catch (e) {
      const msg = pos.checkoutError || getUserFriendlyMessage(e);
      if (e?.isStockError) notify.error(msg);
      else if (e?.recoverable) notify.warning(msg);
      else notify.error(msg);
    }
  };

  const handleOpenInvoice = async (invoiceName) => {
    setViewMode('invoices');
    setInvoiceLoadingId(invoiceName);
    try {
      const res = await getPOSInvoice(invoiceName);
      const invoiceDoc = res?.data?.data || { name: invoiceName };
      setSelectedInvoice(invoiceDoc);
      pos.setLastInvoice(invoiceDoc);
      setShowReceipt(true);
    } catch {
      setSelectedInvoice({ name: invoiceName, items: [], customer: '—', grand_total: 0, status: 'Draft' });
    } finally {
      setInvoiceLoadingId('');
    }
  };

  const readOnlyPOS = !canOperatePOS;
  const sellDisabled = readOnlyPOS || !pos.shiftOpen || pos.profileLoading;

  return (
    <div className="pos-page">
      <header className="pos-topbar">
        <div className="pos-topbar__brand">
          <img className="pos-topbar__logo" src="/logo.png" alt="" />
          <div className="pos-topbar__brand-text">
            <span className="pos-topbar__brand-name">Elmahdi POS</span>
            {pos.profile?.name && (
              <span className="pos-topbar__brand-sub">{pos.profile.name}</span>
            )}
          </div>
        </div>

        {viewMode === 'sell' && canOperatePOS && (
          <div className="pos-topbar__search">
            <SearchInput
              value={pos.query}
              onChange={handleSearch}
              placeholder={t('pos.searchPlaceholder')}
              inputRef={pos.searchRef}
              autoFocus
            />
          </div>
        )}

        <div className="pos-topbar__shift-pill" data-state={pos.shiftOpen ? 'open' : 'closed'}>
          <span className="pos-topbar__shift-dot" />
          <span className="pos-topbar__shift-text">
            {pos.shiftOpen ? t('pos.shiftOpen') : t('pos.noShift')}
          </span>
        </div>

        <div className="pos-topbar__actions">
          <UserSessionActions
            user={user}
            compact
            links={posSessionLinks}
            onLogout={requestLogout}
          />
        </div>
      </header>

      {readOnlyPOS && (
        <p className="pos-cart__shift-warn" style={{ margin: '0 1rem' }}>
          {canMonitorCashiers ? t('pos.monitorMode') : t('pos.viewOnly')}
        </p>
      )}

      {pos.shift?.pendingClose && (
        <div className="pos-operational-banner" role="status">
          <p>{t('pos.pendingClose')}</p>
        </div>
      )}

      <POSShiftBar
        profile={pos.profile}
        shift={pos.shift}
        shiftOpen={pos.shiftOpen}
        shiftLoading={pos.shiftLoading}
        shiftError={pos.shiftError}
        onStartShift={pos.openShift}
        onEndShift={handleEndShift}
        onRefresh={pos.refreshShift}
        readOnly={readOnlyPOS || !canManageShift}
      />

      <POSMetricsBar metrics={pos.metrics} shiftOpen={pos.shiftOpen} />

      {(initError || pos.profileError) && (
        <ApiErrorCard message={initError || pos.profileError} onRetry={() => pos.init()} />
      )}

      {pos.checkoutError && (
        <div className="pos-operational-banner" role="alert">
          <p>{pos.checkoutError}</p>
        </div>
      )}

      {pos.pendingInvoice && (
        <div className="pos-pending card">
          <p>
            {t('pos.draftInvoicePre')} <strong className="mono">{pos.pendingInvoice}</strong> {t('pos.draftInvoicePost')} {t('pos.draftInvoiceHint')}
          </p>
          <div className="pos-pending__actions">
            <Btn variant="primary" size="sm" loading={pos.checkoutLoading} onClick={() => pos.recoverPendingInvoice()}>{t('pos.retrySubmit')}</Btn>
            <Btn variant="ghost" size="sm" onClick={() => pos.dismissPendingInvoice()}>{t('pos.dismissDraft')}</Btn>
          </div>
        </div>
      )}

      {canOperatePOS && (
        <div className="pos-segctrl-bar">
          <div className="pos-segctrl" role="tablist" aria-label="View">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'sell'}
              className={`pos-segctrl__btn ${viewMode === 'sell' ? 'pos-segctrl__btn--active' : ''}`}
              onClick={() => setViewMode('sell')}
            >
              {t('pos.sell')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'invoices'}
              className={`pos-segctrl__btn ${viewMode === 'invoices' ? 'pos-segctrl__btn--active' : ''}`}
              onClick={() => setViewMode('invoices')}
            >
              {t('pos.myInvoices')}
            </button>
          </div>
        </div>
      )}

      {viewMode === 'sell' ? (
        <div className="pos-body">
          <section className="pos-products">
            {pos.productsError && (
              <ApiErrorCard title={t('pos.couldNotLoadProducts')} message={pos.productsError} onRetry={() => pos.loadItems(pos.query)} />
            )}
            {pos.loading && !pos.items.length ? (
              <div className="pos-grid" aria-busy="true">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="item-card item-card--skeleton" aria-hidden>
                    <div className="item-card__img item-card__img--skeleton" />
                    <div className="item-card__body">
                      <div className="skeleton-line skeleton-line--lg" />
                      <div className="skeleton-line skeleton-line--sm" />
                    </div>
                  </div>
                ))}
              </div>
            ) : pos.items.length === 0 ? (
              <EmptyState
                icon="🔍"
                title={t('pos.noProductsFound')}
                desc={pos.shiftOpen ? t('pos.searchOrScan') : t('pos.startShiftFirst')}
              />
            ) : (
              <>
                {allOutOfStock && (
                  <div className="pos-oos-banner" role="status">
                    <span className="pos-oos-banner__icon" aria-hidden>⚠</span>
                    <div>
                      <p className="pos-oos-banner__title">
                        {t('pos.allOutOfStockTitle', { defaultValue: 'All visible items are out of stock' })}
                      </p>
                      <p className="pos-oos-banner__desc">
                        {t('pos.allOutOfStockDesc', { defaultValue: 'Refine your search or wait for stock to be received before continuing checkout.' })}
                      </p>
                    </div>
                  </div>
                )}
                <div className={`pos-grid ${pos.loading ? 'pos-grid--loading' : ''}`}>
                  {shelfItems.map((item) => (
                    <ItemCard key={item.item_code} item={item} onAdd={pos.addToCart} disabled={sellDisabled} />
                  ))}
                </div>
              </>
            )}
          </section>

          <aside className="pos-bill">
            <header className="pos-bill__head">
              <div>
                <h2 className="pos-bill__title">{t('pos.cartTitle')}</h2>
                <p className="pos-bill__sub">{t('pos.itemsCount', { count: pos.cartCount })}</p>
              </div>
              {pos.cartCount > 0 && (
                <button type="button" className="pos-bill__clear" onClick={handleClearCart}>
                  {t('common.clear')}
                </button>
              )}
            </header>

            {!pos.shiftOpen && (
              <p className="pos-bill__shift-warn">{t('pos.startShiftCheckout')}</p>
            )}

            <div className="pos-bill__customer">
              <label className="pos-bill__field-label" htmlFor="pos-customer">{t('pos.customerLabel')}</label>
              <select
                id="pos-customer"
                className="input pos-bill__customer-select"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                disabled={sellDisabled}
              >
                <option value="Walk-in Customer">{t('pos.walkInCustomer')}</option>
                {customers.filter((c) => c.name !== 'Walk-in Customer').map((c) => (
                  <option key={c.name} value={c.name}>{c.customer_name || c.name}</option>
                ))}
              </select>
            </div>

            <div className="pos-bill__lines">
              {pos.cart.length === 0 ? (
                <EmptyState icon="🛒" title={t('pos.cartEmpty')} desc={t('pos.tapOrScan')} />
              ) : (
                pos.cart.map((item) => (
                  <CartRow
                    key={item.item_code}
                    item={item}
                    onQty={pos.updateQty}
                    onRemove={pos.removeFromCart}
                    maxQty={availableQty(item) ?? undefined}
                  />
                ))
              )}
            </div>

            {(pos.cartWarning || pos.stockIssues.length > 0) && (
              <div className="pos-bill__warnings">
                {pos.cartWarning && <p>{pos.cartWarning}</p>}
                {pos.stockIssues.map((i) => (
                  <p key={i.item_code}>{i.item_name}: {i.message}</p>
                ))}
              </div>
            )}

            <dl className="pos-bill__totals">
              <div className="pos-bill__totals-row">
                <dt>{t('pos.itemsLabel', { defaultValue: 'Items' })}</dt>
                <dd>{pos.cartCount}</dd>
              </div>
              <div className="pos-bill__totals-row">
                <dt>{t('pos.subtotal', { defaultValue: 'Subtotal' })}</dt>
                <dd className="mono">EGP {pos.cartTotal.toFixed(2)}</dd>
              </div>
              <div className="pos-bill__totals-row pos-bill__totals-row--total">
                <dt>{t('pos.total')}</dt>
                <dd className="mono">EGP {pos.cartTotal.toFixed(2)}</dd>
              </div>
            </dl>

            <div className="pos-bill__payment">
              <p className="pos-bill__field-label">{t('pos.selectPayment', { defaultValue: 'Payment' })}</p>
              <POSPaymentPanel
                paymentModes={pos.paymentModes}
                total={pos.cartTotal}
                value={payment}
                onChange={setPayment}
                disabled={sellDisabled || !pos.cart.length}
              />
            </div>

            <div className="pos-bill__cta-wrap">
              {(checkoutErr || pos.checkoutError) && (
                <p className="pos-bill__error">{checkoutErr || pos.checkoutError}</p>
              )}
              <Btn
                variant="primary"
                size="lg"
                className="pos-bill__cta"
                loading={pos.checkoutLoading}
                disabled={!canOperatePOS || !pos.cart.length || sellDisabled}
                onClick={handleCheckout}
              >
                {canOperatePOS
                  ? `${t('pos.processTransaction', { defaultValue: 'Process Transaction' })} · EGP ${pos.cartTotal.toFixed(2)}`
                  : t('pos.checkoutDisabled')}
              </Btn>
              <p className="pos-bill__shortcuts mono">{t('pos.shortcuts')}</p>
            </div>
          </aside>
        </div>
      ) : (
        <div className="pos-invoices-page">
          <section className="card pos-invoices-page__list">
            <div className="pos-cart__history-head">
              <h3>{t('pos.myInvoicesTitle')}</h3>
              <button type="button" className="pos-cart__history-refresh" onClick={loadMyInvoices}>{t('common.refresh')}</button>
            </div>
            {invoicesLoading ? (
              <div className="pos-cart__history-loading"><Spinner size={18} /></div>
            ) : myInvoices.length === 0 ? (
              <p className="pos-cart__history-empty">{t('pos.noInvoicesYet')}</p>
            ) : (
              <div className="pos-cart__history-list pos-cart__history-list--full">
                {myInvoices.map((inv) => (
                  <button
                    key={inv.name}
                    type="button"
                    className={`pos-cart__history-item ${selectedInvoice?.name === inv.name ? 'pos-cart__history-item--active' : ''}`}
                    onClick={() => handleOpenInvoice(inv.name)}
                    disabled={invoiceLoadingId === inv.name}
                  >
                    <div>
                      <p className="pos-cart__history-id mono">{inv.name}</p>
                      <p className="pos-cart__history-meta">{inv.customer || t('pos.walkIn')} · {inv.posting_date || '-'}</p>
                    </div>
                    <span className="pos-cart__history-total">
                      {invoiceLoadingId === inv.name ? '…' : `EGP ${Number(inv.grand_total || 0).toFixed(2)}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="pos-invoice-detail">
            {showReceipt && selectedInvoice ? (
              <POSThermalReceipt
                invoice={selectedInvoice}
                companyName={pos.profile?.company}
                onClose={() => setShowReceipt(false)}
              />
            ) : (
              <div className="card pos-invoice-panel__empty">
                <h3>{t('pos.selectInvoice')}</h3>
                <p>{t('pos.viewReceiptHint')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title={t('pos.clearCartTitle', { defaultValue: 'Clear cart?' })}
        message={t('pos.clearCartConfirm')}
        confirmLabel={t('pos.clearCart', { defaultValue: 'Clear cart' })}
        variant="danger"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { pos.clearCart(); setConfirmClear(false); }}
      />
      {guardModal}
    </div>
  );
}
