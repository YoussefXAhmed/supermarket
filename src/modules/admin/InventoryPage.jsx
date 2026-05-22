import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, EmptyState, PageHeader, PageLoading, Table } from '../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import api from '../../services/api';

export default function InventoryPage() {
  const { t } = useTranslation();
  const [bins, setBins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api
      .get('/api/method/elmahdi.api.stock.list_sellable_bins', { params: { limit: 200 } })
      .then((r) => setBins(r.data.message || []))
      .catch(() => setBins([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const text = filter.trim().toLowerCase();
    if (!text) return bins;
    return bins.filter(
      (b) =>
        b.item_code?.toLowerCase().includes(text) ||
        b.warehouse?.toLowerCase().includes(text),
    );
  }, [bins, filter]);

  const columns = [
    {
      key: 'item_code',
      label: t('inventory.page.itemCode'),
      render: (v) => <span className="mono mono-subtle">{v}</span>,
    },
    { key: 'warehouse', label: t('inventory.page.warehouseCol') },
    {
      key: 'sellable_qty',
      label: t('inventory.page.sellable'),
      render: (v) => (
        <Badge color={v > 10 ? 'green' : v > 0 ? 'amber' : 'red'}>{v ?? 0}</Badge>
      ),
    },
    { key: 'actual_qty', label: t('inventory.page.actual'), render: (v) => <span className="mono">{v ?? 0}</span> },
    { key: 'reserved_qty', label: t('inventory.page.reserved'), render: (v) => <span className="mono">{v ?? 0}</span> },
    {
      key: 'valuation_rate',
      label: t('inventory.page.valRate'),
      render: (v) => <span className="mono">EGP {(v || 0).toFixed(2)}</span>,
    },
  ];

  return (
    <TablePageLayout>
      <PageHeader title={t('inventory.page.title')} subtitle={t('inventory.page.subtitle')} dense />
      <input
        className="input toolbar__input-fixed"
        placeholder={t('inventory.page.searchPlaceholder')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {loading ? (
        <PageLoading size={26} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="📦" title={t('inventory.page.noItems')} />
      ) : (
        <LayoutSection variant="raised" flushHead>
          <TableRegion>
            <Table columns={columns} data={filtered} compact />
          </TableRegion>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}
