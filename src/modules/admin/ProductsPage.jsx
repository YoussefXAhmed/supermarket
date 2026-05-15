import { useEffect, useState, useCallback } from 'react';
import { getItems, searchItems } from '../../services/api';
import { PageHeader, SearchInput, PageLoading, ApiErrorCard, EmptyState, Badge } from '../../components/ui';
import { getERPImageUrl } from '../../utils/erpLinks';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

export default function ProductsPage() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [query, setQuery]     = useState('');

  const load = useCallback(async (q = '') => {
    setLoading(true);
    setError('');
    try {
      const res = q ? await searchItems(q) : await getItems({ limit: 100 });
      setItems(res.data.data || []);
    } catch (e) {
      setItems([]);
      setError(getUserFriendlyMessage(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (q) => { setQuery(q); load(q); };

  return (
    <div>
      <PageHeader title="Products" subtitle={`${items.length} items loaded`} />

      <div style={{ marginBottom: 16, maxWidth: 380 }}>
        <SearchInput value={query} onChange={handleSearch} placeholder="Search by name or code…" />
      </div>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={() => load(query)} />
      ) : items.length === 0 ? (
        <EmptyState icon="📦" title="No products found" />
      ) : (
        <div className="products-grid">
          {items.map(item => (
            <div key={item.item_code} className="product-card">
              <div className="product-card__img">
                {item.image
                  ? <img src={getERPImageUrl(item.image)} alt={item.item_name} />
                  : <span>🛒</span>}
              </div>
              <div className="product-card__body">
                <p className="product-card__name">{item.item_name}</p>
                <p className="product-card__code mono">{item.item_code}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <Badge color="default">{item.item_group || 'General'}</Badge>
                  <span className="product-card__price">
                    EGP {(item.standard_rate || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
