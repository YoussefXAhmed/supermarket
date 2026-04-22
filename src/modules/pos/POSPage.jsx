import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePOS } from '../../hooks/usePOS';
import { useAuth } from '../../hooks/useAuth';
import { getCustomers, getMyPOSInvoices, getPOSInvoice } from '../../services/api';
import { Btn, Spinner, SearchInput, EmptyState } from '../../components/ui';
import UserSessionActions from '../../components/layout/UserSessionActions';
import '../../styles/pos.css';

const BASE_URL = 'http://localhost:8000';

function ItemCard({ item, onAdd }) {
  const img = item.image ? `${BASE_URL}${item.image}` : null;
  return (
    <button className="item-card" onClick={() => onAdd(item)}>
      <div className="item-card__img">
        {img ? <img src={img} alt={item.item_name} /> : <span className="item-card__placeholder">🛒</span>}
      </div>
      <div className="item-card__body">
        <p className="item-card__name">{item.item_name}</p>
        <p className="item-card__code">{item.item_code}</p>
        <p className="item-card__price">EGP {(item.standard_rate || 0).toFixed(2)}</p>
      </div>
    </button>
  );
}

function CartRow({ item, onQty, onRemove }) {
  return (
    <div className="cart-row">
      <div className="cart-row__info">
        <p className="cart-row__name">{item.item_name}</p>
        <p className="cart-row__rate">EGP {item.rate.toFixed(2)} each</p>
      </div>
      <div className="cart-row__qty">
        <button className="cart-row__qty-btn" onClick={() => onQty(item.item_code, item.qty - 1)}>−</button>
        <span>{item.qty}</span>
        <button className="cart-row__qty-btn" onClick={() => onQty(item.item_code, item.qty + 1)}>+</button>
      </div>
      <p className="cart-row__total">EGP {(item.qty * item.rate).toFixed(2)}</p>
      <button className="cart-row__remove" onClick={() => onRemove(item.item_code)}>✕</button>
    </div>
  );
}

function InvoiceDetailsPanel({ invoice }) {
  if (!invoice) {
    return (
      <div className="card pos-invoice-panel__empty">
        <h3>Select an invoice</h3>
        <p>Pick an invoice from the list to see full details here.</p>
      </div>
    );
  }

  const lines = invoice.items || [];
  const total = Number(invoice.grand_total || invoice.total || 0);
  const postingDate = invoice.posting_date || new Date().toISOString().slice(0, 10);

  return (
    <div className="card pos-invoice-panel">
      <div className="receipt-modal__header">
        <div>
          <h2>POS Invoice</h2>
          <p className="receipt-modal__sub">In-page ERPNext preview</p>
        </div>
        <span className="receipt-modal__status">{invoice.status || 'Paid'}</span>
      </div>

      <div className="receipt-modal__meta">
        <p><span>Invoice</span><strong className="mono">{invoice.name}</strong></p>
        <p><span>Date</span><strong>{postingDate}</strong></p>
        <p><span>Customer</span><strong>{invoice.customer || 'Walk-in Customer'}</strong></p>
      </div>

      <div className="receipt-modal__table-wrap">
        <table className="receipt-modal__table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const qty = Number(line.qty || 0);
              const rate = Number(line.rate || 0);
              const amount = Number(line.amount ?? qty * rate);
              return (
                <tr key={`${line.item_code || line.item_name}-${idx}`}>
                  <td>{line.item_name || line.item_code}</td>
                  <td>{qty}</td>
                  <td>EGP {rate.toFixed(2)}</td>
                  <td>EGP {amount.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="receipt-modal__footer">
        <div className="receipt-modal__total-row">
          <span>Grand Total</span>
          <strong>EGP {total.toFixed(2)}</strong>
        </div>
        <a
          className="btn btn--ghost btn--md"
          style={{ width: '100%', marginTop: 10, textAlign: 'center' }}
          href={`http://127.0.0.1:8000/printview?doctype=POS%20Invoice&name=${encodeURIComponent(invoice.name)}&format=Standard&no_letterhead=0&letterhead=No%20Letterhead&_lang=en`}
          target="_blank"
          rel="noreferrer"
        >
          Print Invoice
        </a>
      </div>
    </div>
  );
}

export default function POSPage() {
  const { isAdmin, isInventory, logout, user } = useAuth();
  const navigate = useNavigate();
  const pos = usePOS();
  const [customer, setCustomer] = useState('Walk-in Customer');
  const [customers, setCustomers] = useState([]);
  const [checkoutErr, setCheckoutErr] = useState('');
  const [myInvoices, setMyInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceLoadingId, setInvoiceLoadingId] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [viewMode, setViewMode] = useState('sell');

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
    pos.loadItems();
    getCustomers({ limit: 500 })
      .then((res) => {
        const rows = res.data.data || [];
        setCustomers(rows);
      })
      .catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    loadMyInvoices();
  }, [loadMyInvoices, pos.lastInvoice]);

  useEffect(() => {
    if (pos.lastInvoice?.name) {
      setSelectedInvoice(pos.lastInvoice);
      setViewMode('invoices');
    }
  }, [pos.lastInvoice]);

  const handleSearch = useCallback(async (q) => {
    pos.setQuery(q);
    await pos.loadItems(q);
  }, [pos]);

  const handleCheckout = async () => {
    setCheckoutErr('');
    try {
      const selected = customers.find((c) => c.name === customer);
      const nationalId = selected?.national_id || selected?.custom_national_id || selected?.tax_id || '';
      await pos.checkout({
        customer,
        invoiceExtras: nationalId
          ? {
              national_id: nationalId,
              custom_national_id: nationalId,
              tax_id: nationalId,
            }
          : {},
      });
    }
    catch (e) { setCheckoutErr(e.message); }
  };

  const handleOpenInvoice = async (invoiceName) => {
    setViewMode('invoices');
    setInvoiceLoadingId(invoiceName);
    try {
      const res = await getPOSInvoice(invoiceName);
      const invoiceDoc = res?.data?.data || { name: invoiceName };
      setSelectedInvoice(invoiceDoc);
      pos.setLastInvoice(invoiceDoc);
    } catch {
      const fallback = { name: invoiceName, items: [], customer: '—', grand_total: 0, status: 'Draft' };
      setSelectedInvoice(fallback);
      pos.setLastInvoice(fallback);
    } finally {
      setInvoiceLoadingId('');
    }
  };

  return (
    <div className="pos-page">
      {/* ── Top Bar ── */}
      <header className="pos-header">
        <div className="pos-header__brand">
          <img className="pos-header__logo" src="/logo.png" alt="Elmahdi logo" />
          <span className="pos-header__name">Elmahdi POS</span>
        </div>
        <div className="pos-header__center">
          <div className="pos-header__tools">
            <div className="pos-view-toggle">
              <button
                type="button"
                className={`pos-view-toggle__btn ${viewMode === 'sell' ? 'pos-view-toggle__btn--active' : ''}`}
                onClick={() => setViewMode('sell')}
              >
                Sell
              </button>
              <button
                type="button"
                className={`pos-view-toggle__btn ${viewMode === 'invoices' ? 'pos-view-toggle__btn--active' : ''}`}
                onClick={() => setViewMode('invoices')}
              >
                My Invoices
              </button>
            </div>
            {viewMode === 'sell' && (
              <SearchInput
                value={pos.query}
                onChange={handleSearch}
                placeholder="Search products… (barcode, name)"
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
              ...(isAdmin || isInventory ? [{ label: 'Stock', onClick: () => navigate('/inventory') }] : []),
              ...(isAdmin ? [{ label: 'Admin', onClick: () => navigate('/admin') }] : []),
            ]}
            onLogout={async () => { await logout(); navigate('/login'); }}
          />
        </div>
      </header>

      {viewMode === 'sell' ? (
        <div className="pos-body">
        {/* ── Product Grid ── */}
        <section className="pos-products">
          {pos.loading ? (
            <div className="pos-loading"><Spinner size={28} /></div>
          ) : pos.items.length === 0 ? (
            <EmptyState icon="🔍" title="No products found" desc="Try a different search term" />
          ) : (
            <div className="pos-grid">
              {pos.items.map(item => (
                <ItemCard key={item.item_code} item={item} onAdd={pos.addToCart} />
              ))}
            </div>
          )}
        </section>

        {/* ── Cart ── */}
        <aside className="pos-cart">
          <div className="pos-cart__header">
            <h2 className="pos-cart__title">Cart</h2>
            <span className="pos-cart__count">{pos.cartCount} items</span>
            {pos.cartCount > 0 && (
              <button className="pos-cart__clear" onClick={pos.clearCart}>Clear</button>
            )}
          </div>

          <div className="pos-cart__customer">
            <label className="pos-cart__customer-label">Customer</label>
            <select
              className="pos-cart__customer-input"
              value={customer}
              onChange={e => setCustomer(e.target.value)}
            >
              <option value="Walk-in Customer">Walk-in Customer</option>
              {customers
                .filter((c) => c.name !== 'Walk-in Customer')
                .map((c) => {
                const label = c.customer_name || c.name;
                return <option key={c.name} value={c.name}>{label}</option>;
              })}
            </select>
          </div>

          <div className="pos-cart__items">
            {pos.cart.length === 0 ? (
              <EmptyState icon="🛒" title="Cart is empty" desc="Tap a product to add it" />
            ) : (
              pos.cart.map(item => (
                <CartRow key={item.item_code} item={item}
                  onQty={pos.updateQty} onRemove={pos.removeFromCart} />
              ))
            )}
          </div>

          <div className="pos-cart__footer">
            <div className="pos-cart__subtotal">
              <span>Subtotal</span>
              <span>EGP {pos.cartTotal.toFixed(2)}</span>
            </div>
            <div className="pos-cart__total">
              <span>Total</span>
              <span className="pos-cart__total-amount">EGP {pos.cartTotal.toFixed(2)}</span>
            </div>

            {checkoutErr && <p className="pos-cart__error">{checkoutErr}</p>}

            <Btn
              variant="primary" size="lg"
              loading={pos.checkoutLoading}
              disabled={pos.cart.length === 0}
              onClick={handleCheckout}
              style={{ width: '100%' }}
            >
              💳 Checkout — EGP {pos.cartTotal.toFixed(2)}
            </Btn>
          </div>
        </aside>
      </div>
      ) : (
        <div className="pos-invoices-page">
          <section className="card pos-invoices-page__list">
            <div className="pos-cart__history-head">
              <h3>My Invoices</h3>
              <button className="pos-cart__history-refresh" onClick={loadMyInvoices}>Refresh</button>
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
                      <p className="pos-cart__history-meta">{inv.customer || 'Walk-in Customer'} · {inv.posting_date || '-'}</p>
                    </div>
                    <span className="pos-cart__history-total">
                      {invoiceLoadingId === inv.name ? 'Loading…' : `EGP ${Number(inv.grand_total || 0).toFixed(2)}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <InvoiceDetailsPanel invoice={selectedInvoice} />
        </div>
      )}
    </div>
  );
}
