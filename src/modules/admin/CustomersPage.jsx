import { useEffect, useState } from 'react';
import { getCustomers } from '../../services/api';
import { PageHeader, Spinner, EmptyState, Table } from '../../components/ui';

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => {
    getCustomers({ limit: 100 })
      .then(r => {
        setCustomers(r.data.data || []);
        setError('');
      })
      .catch((e) => {
        setCustomers([]);
        setError(e.message || 'Failed to load customers');
      })
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    { key: 'customer_name', label: 'Name' },
    { key: 'name',          label: 'ID', render: v => <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>{v}</span> },
    { key: 'customer_group', label: 'Group' },
    { key: 'territory',     label: 'Territory' },
    { key: 'mobile_no',     label: 'Mobile', render: v => v || '—' },
  ];

  return (
    <div>
      <PageHeader title="Customers" subtitle={`${customers.length} customers`} />
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={26} /></div>
      ) : error ? (
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.35)', color: 'var(--red)' }}>
          {error}
        </div>
      ) : customers.length === 0 ? (
        <EmptyState icon="👥" title="No customers yet" />
      ) : (
        <Table columns={columns} data={customers} />
      )}
    </div>
  );
}
