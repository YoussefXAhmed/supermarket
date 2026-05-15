import { useEffect, useState } from 'react';
import { EmptyState, PageHeader, PageLoading, ApiErrorCard, Table } from '../../../components/ui';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { listWarehouses } from '../../../services/inventoryApi';

export default function WarehousesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listWarehouses({ limit: 300 });
      setRows(res?.data?.data || []);
    } catch (e) {
      setRows([]);
      setError(getUserFriendlyMessage(e, 'Failed to load warehouses'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const columns = [
    { key: 'warehouse_name', label: 'Warehouse' },
    { key: 'name', label: 'ID', render: (v) => <span className="mono">{v}</span> },
    { key: 'warehouse_type', label: 'Type', render: (v) => v || '—' },
    { key: 'company', label: 'Company' },
    { key: 'parent_warehouse', label: 'Parent', render: (v) => v || '—' },
  ];

  return (
    <div>
      <PageHeader title="Warehouses" subtitle="ERPNext warehouse list (read-only)" />

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon="🏬" title="No warehouses found" />
      ) : (
        <Table columns={columns} data={rows} />
      )}
    </div>
  );
}
