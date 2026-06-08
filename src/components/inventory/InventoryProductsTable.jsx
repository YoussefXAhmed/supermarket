import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Table } from '../ui';
import { stockStateIcon } from '../icons';

export default function InventoryProductsTable({
  rows,
  showValuation = true,
  canManageItemMaster = false,
}) {
  const { t } = useTranslation();
  const columns = [
    {
      key: 'item_name',
      label: t('inventory.table.product'),
      render: (v, row) => (
        <div style={{ maxWidth: 280, minWidth: 0 }}>
          <p
            style={{
              fontWeight: 600,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.3,
            }}
            title={v || row.item_code}
          >
            {v || row.item_code}
          </p>
          <p className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{row.item_code}</p>
        </div>
      ),
    },
    {
      key: 'qty',
      label: t('inventory.stockEntry.quantity'),
      render: (v, row) => (
        <div>
          <Badge color={v > 10 ? 'green' : v > 0 ? 'amber' : 'red'}>
            {v.toFixed(2)}
          </Badge>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
            {row.warehouse_label || t('inventory.allWarehouses')}
          </p>
        </div>
      ),
    },
    ...(showValuation
      ? [{
        key: 'price',
        label: t('inventory.table.buyingPrice'),
        render: (v) => <span className="mono">EGP {Number(v || 0).toFixed(2)}</span>,
      }]
      : []),
    {
      key: 'stock_state',
      label: t('finance.table.status'),
      render: (_, row) => {
        const { Icon, tone } = stockStateIcon({ qty: row.qty, lowThreshold: row.reorder_level || 5 });
        const label = tone === 'red'
          ? t('inventory.alerts.outOfStock', { defaultValue: 'Out of stock' })
          : tone === 'amber'
            ? t('inventory.alerts.lowStock', { defaultValue: 'Low stock' })
            : t('inventory.table.inStock', { defaultValue: 'In stock' });
        return (
          <Badge color={tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : 'green'}>
            <span className={`status-icon status-icon--${tone}`}>
              <Icon size={14} />
              <span>{label}</span>
            </span>
          </Badge>
        );
      },
    },
    {
      key: 'value',
      label: t('inventory.table.stockValue'),
      render: (v) => <span className="mono">EGP {v.toFixed(2)}</span>,
    },
    {
      key: 'actions',
      label: t('ui.table.actions'),
      render: (_, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link
            className="btn btn--ghost btn--sm"
            to={`/inventory/items/${encodeURIComponent(row.item_code)}`}
          >
            {canManageItemMaster ? t('common.edit') : t('common.view')}
          </Link>
        </div>
      ),
    },
  ];

  const tableData = rows.map((row) => ({
    ...row,
    id: row.row_key || `${row.item_code}|${row.warehouse || 'all'}`,
  }));

  return <Table columns={columns} data={tableData} emptyMsg={t('inventory.noProductsFound')} compact />;
}

