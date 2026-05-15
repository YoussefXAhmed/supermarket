import { useEffect, useState } from 'react';
import { getCustomers } from '../../services/api';
import { PageHeader, PageLoading, ApiErrorCard, EmptyState, Table } from '../../components/ui';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    getCustomers({ limit: 100 })
      .then(r => {
        setCustomers(r.data.data || []);
      })
      .catch((e) => {
        setCustomers([]);
        setError(getUserFriendlyMessage(e, 'Failed to load customers'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const columns = [
    { key: 'customer_name', label: 'Name' },
    { key: 'name',          label: 'ID', render: v => <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>{v}</span> },
    { key: 'customer_type', label: 'Type', render: v => v || '—' },
    { key: 'customer_group', label: 'Group' },
    { key: 'territory',     label: 'Territory' },
    { key: 'mobile_no',     label: 'Mobile', render: v => v || '—' },
  ];

  return (
    <div>
      <PageHeader title="Customers" subtitle={`${customers.length} customers`} />
      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : customers.length === 0 ? (
        <EmptyState icon="👥" title="No customers yet" />
      ) : (
        <Table columns={columns} data={customers} />
      )}
    </div>
  );
}
