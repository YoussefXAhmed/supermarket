import { useState, useCallback, useRef } from 'react';
import {
  searchItems,
  getItems,
  createPOSInvoice,
  submitPOSInvoice,
  getPOSInvoice,
} from '../services/api';

export function usePOS() {
  const [items, setItems]       = useState([]);
  const [cart, setCart]         = useState([]);
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError]       = useState(null);
  const [lastInvoice, setLastInvoice] = useState(null);
  const searchRef = useRef(null);

  const loadItems = useCallback(async (q = '') => {
    setLoading(true);
    setError(null);
    try {
      const res = q ? await searchItems(q) : await getItems({ limit: 60 });
      setItems(res.data.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const addToCart = useCallback((item) => {
    setCart(prev => {
      const existing = prev.find(c => c.item_code === item.item_code);
      if (existing) {
        return prev.map(c =>
          c.item_code === item.item_code ? { ...c, qty: c.qty + 1 } : c
        );
      }
      return [...prev, { ...item, qty: 1, rate: item.standard_rate || 0 }];
    });
  }, []);

  const removeFromCart = useCallback((item_code) => {
    setCart(prev => prev.filter(c => c.item_code !== item_code));
  }, []);

  const updateQty = useCallback((item_code, qty) => {
    if (qty <= 0) { removeFromCart(item_code); return; }
    setCart(prev => prev.map(c => c.item_code === item_code ? { ...c, qty } : c));
  }, [removeFromCart]);

  const clearCart = useCallback(() => setCart([]), []);

  const cartTotal = cart.reduce((s, i) => s + i.qty * i.rate, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const checkout = useCallback(async ({ customer = 'Walk-in Customer', invoiceExtras = {} } = {}) => {
    if (!cart.length) return;
    setCheckoutLoading(true);
    setError(null);
    try {
      const payload = {
        customer,
        items: cart.map(i => ({
          item_code: i.item_code,
          item_name: i.item_name,
          qty: i.qty,
          rate: i.rate,
          uom: i.stock_uom || 'Nos',
        })),
        is_pos: 1,
        payments: [
          {
            mode_of_payment: 'Cash',
            amount: Number(cartTotal.toFixed(2)),
          },
        ],
        ...invoiceExtras,
      };
      const res = await createPOSInvoice(payload);
      const name = res.data.data.name;
      await submitPOSInvoice(name);
      const invoiceRes = await getPOSInvoice(name);
      setLastInvoice(invoiceRes.data.data || { name, customer, grand_total: cartTotal, items: payload.items });
      clearCart();
      return name;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setCheckoutLoading(false);
    }
  }, [cart, cartTotal, clearCart]);

  return {
    items, cart, query, setQuery,
    loading, checkoutLoading, error, lastInvoice, setLastInvoice,
    loadItems, addToCart, removeFromCart, updateQty, clearCart,
    cartTotal, cartCount, checkout, searchRef,
  };
}
