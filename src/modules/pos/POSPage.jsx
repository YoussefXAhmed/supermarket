import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePOS } from '../../hooks/usePOS';
import { useAuth } from '../../hooks/useAuth';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { getCustomers, getMyPOSInvoices, getPOSInvoice } from '../../services/api';
import {
  Btn,
  Spinner,
  SearchInput,
  EmptyState,
  PageLoading,
  ApiErrorCard,
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
import '../../styles/pos.css';

const DEFAULT_PAYMENT = { mode: 'cash', singleMode: 'Cash', cashAmount: '', cardAmount: '', cashMode: 'Cash', cardMode: 'Card' };

function stockLabel(item) {
  const avail = availableQty(item);
  if (avail === null) return null;
  if (avail <= 0) return { text: 'No physical stock', className: 'item-card__stock--out' };
  if (avail < 5) return { text: `${avail} left`, className: 'item-card__stock--low' };
  return { text: `In stock: ${avail}`, className: 'item-card__stock--ok' };
}

function ItemCard({ item, onAdd, disabled }) {
  const img = getERPImageUrl(item.image);
  const stock = stockLabel(item);
  const out = stock?.className === 'item-card__stock--out';
  const dev = import.meta.env.DEV;
  return (
    <button type="button" className="item-card" onClick={() => onAdd(item)} disabled={disabled || out}>
      <div className="item-card__img">
        {img ? <img src={img} alt={item.item_name} /> : <span className="item-card__placeholder">🛒</span>}
      </div>
      <div className="item-card__body">
        <p className="item-card__name">{item.item_name}</p>
        <p className="item-card__code mono">{item.item_code}</p>
        {stock && <p className={`item-card__stock ${stock.className}`}>{stock.text}</p>}
        {dev && item?.is_stock_item !== 0 && (
          <p className="item-card__stock mono" style={{ opacity: 0.75 }}>
            wh: {item.pos_warehouse || '—'} · actual: {Number(item.actual_qty || 0)} · reserved:{' '}
            {Number(item.reserved_qty || 0)} · displayed: {availableQty(item) ?? '—'}
          </p>
        )}
        <p className="item-card__price">EGP {(item.standard_rate || 0).toFixed(2)}</p>
      </div>
    </button>
  );
}

function CartRow({ item, onQty, onRemove, maxQty }) {
  const avail = availableQty(item);
  return (
    <div className="cart-row">
      <div className="cart-row__info">
        <p className="cart-row__name">{item.item_name}</p>
        <p className="cart-row__rate">EGP {item.rate.toFixed(2)} each</p>
        {avail !== null && <p className="cart-row__stock">Available: {avail}</p>}
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
  const {
    canOperatePOS,
    canManageShift,
    canMonitorCashiers,
    canAccessInventory,
    canAccessAdminWorkspace,
    logout,
    user,
  } = useAuth();
  const navigate = useNavigate();
  const notify = useNotify();
  const pos = usePOS(user);

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
  const [initError, setInitError] = useState('');
  const initDone = useRef(false);

  useBarcodeScanner({
    enabled: viewMode === 'sell' && pos.shiftOpen,
    onScan: async (code) => {
      try {
        const item = await pos.resolveItemByScan(code);
        if (item) pos.addToCart(item);
        else setCheckoutErr(`No product for barcode: ${code}`);
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
    if (window.confirm('Clear all items from the cart?')) pos.clearCart();
  };

  const handleCheckout = async () => {
    setCheckoutErr('');
    if (!pos.shiftOpen) {
      setCheckoutErr('Start a shift before checkout.');
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
      notify.success(`Sale complete — ${invoice?.name || 'invoice submitted'}`);
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
      <header className="pos-header">
        <div className="pos-header__brand">
          <img className="pos-header__logo" src="/logo.png" alt="" />
          <span className="pos-header__name">Elmahdi POS</span>
        </div>
        <div className="pos-header__center">
          <div className="pos-header__tools">
            <div className="pos-view-toggle">
              {canOperatePOS && (
                <button type="button" className={`pos-view-toggle__btn ${viewMode === 'sell' ? 'pos-view-toggle__btn--active' : ''}`} onClick={() => setViewMode('sell')}>Sell</button>
              )}
              <button type="button" className={`pos-view-toggle__btn ${viewMode === 'invoices' ? 'pos-view-toggle__btn--active' : ''}`} onClick={() => setViewMode('invoices')}>
                {canOperatePOS ? 'My Invoices' : 'Invoices'}
              </button>
            </div>
            {viewMode === 'sell' && canOperatePOS && (
              <SearchInput
                value={pos.query}
                onChange={handleSearch}
                placeholder="Search or scan barcode…"
                inputRef={pos.searchRef}
                autoFocus
              />
            )}
          </div>
        </div>
        <div className="pos-header__actions">
          <UserSessionActions
            user={user}
            compact
            links={[
              ...(canAccessInventory ? [{ label: 'Stock', onClick: () => navigate('/inventory') }] : []),
              ...(canAccessAdminWorkspace ? [{ label: 'Admin', onClick: () => navigate('/admin') }] : []),
            ]}
            onLogout={async () => { await logout(); navigate('/login'); }}
          />
        </div>
      </header>

      {readOnlyPOS && (
        <p className="pos-cart__shift-warn" style={{ margin: '0 1rem' }}>
          {canMonitorCashiers
            ? 'Monitor mode — checkout and shift controls are disabled.'
            : 'View-only — you do not have permission to operate the register.'}
        </p>
      )}

      {pos.shift?.pendingClose && (
        <div className="pos-operational-banner" role="status">
          <p>
            Shift close is pending manager approval — selling is disabled until the closing is submitted.
          </p>
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
            Draft invoice <strong className="mono">{pos.pendingInvoice}</strong> exists in ERP but is not submitted.
            Retry only if stock or validation issues are resolved.
          </p>
          <div className="pos-pending__actions">
            <Btn variant="primary" size="sm" loading={pos.checkoutLoading} onClick={() => pos.recoverPendingInvoice()}>Retry submit</Btn>
            <Btn variant="ghost" size="sm" onClick={() => pos.dismissPendingInvoice()}>Dismiss draft</Btn>
          </div>
        </div>
      )}

      {viewMode === 'sell' ? (
        <div className="pos-body">
          <section className="pos-products">
            {pos.productsError && (
              <ApiErrorCard title="Could not load products" message={pos.productsError} onRetry={() => pos.loadItems(pos.query)} />
            )}
            {pos.loading && !pos.items.length ? (
              <PageLoading size={28} className="pos-loading" />
            ) : pos.items.length === 0 ? (
              <EmptyState icon="🔍" title="No products found" desc={pos.shiftOpen ? 'Search or scan a barcode' : 'Start your shift first'} />
            ) : (
              <div className={`pos-grid ${pos.loading ? 'pos-grid--loading' : ''}`}>
                {pos.items.map((item) => (
                  <ItemCard key={item.item_code} item={item} onAdd={pos.addToCart} disabled={sellDisabled} />
                ))}
              </div>
            )}
          </section>

          <aside className="pos-cart">
            <div className="pos-cart__header">
              <h2 className="pos-cart__title">Cart</h2>
              <span className="pos-cart__count">{pos.cartCount} items</span>
              {pos.cartCount > 0 && (
                <button type="button" className="pos-cart__clear" onClick={handleClearCart}>Clear</button>
              )}
            </div>

            {!pos.shiftOpen && (
              <p className="pos-cart__shift-warn">Start shift to enable checkout (F2)</p>
            )}

            <div className="pos-cart__customer">
              <label className="pos-cart__customer-label" htmlFor="pos-customer">Customer</label>
              <select id="pos-customer" className="pos-cart__customer-input" value={customer} onChange={(e) => setCustomer(e.target.value)} disabled={sellDisabled}>
                <option value="Walk-in Customer">Walk-in Customer</option>
                {customers.filter((c) => c.name !== 'Walk-in Customer').map((c) => (
                  <option key={c.name} value={c.name}>{c.customer_name || c.name}</option>
                ))}
              </select>
            </div>

            <POSPaymentPanel
              paymentModes={pos.paymentModes}
              total={pos.cartTotal}
              value={payment}
              onChange={setPayment}
              disabled={sellDisabled || !pos.cart.length}
            />

            <div className="pos-cart__items">
              {pos.cart.length === 0 ? (
                <EmptyState icon="🛒" title="Cart is empty" desc="Tap a product or scan barcode" />
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
              <div className="pos-cart__warnings">
                {pos.cartWarning && <p>{pos.cartWarning}</p>}
                {pos.stockIssues.map((i) => (
                  <p key={i.item_code}>{i.item_name}: {i.message}</p>
                ))}
              </div>
            )}

            <div className="pos-cart__footer">
              <div className="pos-cart__total">
                <span>Total</span>
                <span className="pos-cart__total-amount mono">EGP {pos.cartTotal.toFixed(2)}</span>
              </div>
              {(checkoutErr || pos.checkoutError) && (
                <p className="pos-cart__error">{checkoutErr || pos.checkoutError}</p>
              )}
              <Btn
                variant="primary"
                size="lg"
                className="pos-cart__checkout-btn"
                loading={pos.checkoutLoading}
                disabled={!canOperatePOS || !pos.cart.length || sellDisabled}
                onClick={handleCheckout}
              >
                {canOperatePOS ? `Checkout · EGP ${pos.cartTotal.toFixed(2)}` : 'Checkout disabled'}
              </Btn>
              <p className="pos-cart__shortcuts mono">F2 checkout · Esc clear cart</p>
            </div>
          </aside>
        </div>
      ) : (
        <div className="pos-invoices-page">
          <section className="card pos-invoices-page__list">
            <div className="pos-cart__history-head">
              <h3>My Invoices</h3>
              <button type="button" className="pos-cart__history-refresh" onClick={loadMyInvoices}>Refresh</button>
            </div>
            {invoicesLoading ? (
              <div className="pos-cart__history-loading"><Spinner size={18} /></div>
            ) : myInvoices.length === 0 ? (
              <p className="pos-cart__history-empty">No invoices yet.</p>
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
                      <p className="pos-cart__history-meta">{inv.customer || 'Walk-in'} · {inv.posting_date || '-'}</p>
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
                <h3>Select an invoice</h3>
                <p>View receipt and print from the list.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
