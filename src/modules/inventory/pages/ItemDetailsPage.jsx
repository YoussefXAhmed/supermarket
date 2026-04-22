import { useState } from 'react';
import { Btn, EmptyState, PageHeader, Spinner, Table } from '../../../components/ui';
import { getItemDetails, listBins } from '../../../services/inventoryApi';

export default function ItemDetailsPage() {
  const [itemCode, setItemCode] = useState('');
  const [item, setItem] = useState(null);
  const [bins, setBins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!itemCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const [itemRes, binsRes] = await Promise.all([
        getItemDetails(itemCode.trim()),
        listBins({ limit: 500, filters: [['item_code', '=', itemCode.trim()]] }),
      ]);
      setItem(itemRes?.data?.data || null);
      setBins(binsRes?.data?.data || []);
    } catch (e) {
      setItem(null);
      setBins([]);
      setError(e.message || 'Failed to load item details');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'actual_qty', label: 'Actual Qty', render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'reserved_qty', label: 'Reserved', render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'ordered_qty', label: 'Ordered', render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'valuation_rate', label: 'Valuation', render: (v) => <span className="mono">EGP {Number(v || 0).toFixed(2)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Item Details" subtitle="Item profile with per-warehouse stock from Bin" />
      <div className="card panel">
        <div className="toolbar__group">
          <input className="input toolbar__input-sm" placeholder="Item code (e.g. ITEM-001)" value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
          <Btn variant="ghost" size="sm" onClick={load}>Load Item</Btn>
        </div>
      </div>

      {loading ? (
        <div className="content-loading"><Spinner size={26} /></div>
      ) : error ? (
        <div className="card content-error">{error}</div>
      ) : !item ? (
        <EmptyState icon="🧾" title="No item loaded" desc="Enter item code and click Load Item." />
      ) : (
        <>
          <div className="card panel">
            <h3 className="section-title">{item.item_name || item.item_code}</h3>
            <div className="meta-grid">
              <p><strong>Code:</strong> <span className="mono">{item.item_code}</span></p>
              <p><strong>Group:</strong> {item.item_group || '—'}</p>
              <p><strong>UOM:</strong> {item.stock_uom || '—'}</p>
              <p><strong>Standard Rate:</strong> EGP {Number(item.standard_rate || 0).toFixed(2)}</p>
            </div>
          </div>
          {bins.length === 0 ? (
            <EmptyState icon="🏬" title="No warehouse stock records found" />
          ) : (
            <Table columns={columns} data={bins} />
          )}
        </>
      )}
    </div>
  );
}
