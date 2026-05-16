import { Badge, Table } from '../ui';
import { getERPDeskUrl } from '../../utils/erpLinks';

export default function InventoryProductsTable({ rows, showValuation = true }) {
  const columns = [
    {
      key: 'item_name',
      label: 'Product',
      render: (v, row) => (
        <div>
          <p style={{ fontWeight: 600 }}>{v || row.item_code}</p>
          <p className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{row.item_code}</p>
        </div>
      ),
    },
    {
      key: 'qty',
      label: 'Quantity',
      render: (v, row) => (
        <div>
          <Badge color={v > 10 ? 'green' : v > 0 ? 'amber' : 'red'}>
            {v.toFixed(2)}
          </Badge>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
            {row.warehouse_label || 'All warehouses'}
          </p>
        </div>
      ),
    },
    ...(showValuation
      ? [{
        key: 'price',
        label: 'Price',
        render: (v) => <span className="mono">EGP {v.toFixed(2)}</span>,
      }]
      : []),
    {
      key: 'stock_state',
      label: 'Status',
      render: (_, row) => (
        row.qty < 10
          ? <Badge color="amber">Low Stock</Badge>
          : <Badge color="green">In Stock</Badge>
      ),
    },
    {
      key: 'value',
      label: 'Stock Value',
      render: (v) => <span className="mono">EGP {v.toFixed(2)}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a
            className="btn btn--ghost btn--sm"
            href={getERPDeskUrl(`item/${encodeURIComponent(row.item_code)}`)}
            target="_blank"
            rel="noreferrer"
          >
            Edit
          </a>
          <a
            className="btn btn--ghost btn--sm"
            href={getERPDeskUrl('stock-entry')}
            target="_blank"
            rel="noreferrer"
          >
            Stock Entry
          </a>
        </div>
      ),
    },
  ];

  const tableData = rows.map((row) => ({
    ...row,
    id: row.row_key || `${row.item_code}|${row.warehouse || 'all'}`,
  }));

  return <Table columns={columns} data={tableData} emptyMsg="No inventory products found" compact />;
}

