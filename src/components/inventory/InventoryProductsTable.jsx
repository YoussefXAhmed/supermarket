import { useTranslation } from 'react-i18next';
import { Badge, Table } from '../ui';
import { getERPDeskUrl } from '../../utils/erpLinks';

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
        label: t('inventory.table.price'),
        render: (v) => <span className="mono">EGP {v.toFixed(2)}</span>,
      }]
      : []),
    {
      key: 'stock_state',
      label: t('finance.table.status'),
      render: (_, row) => (
        row.qty < 10
          ? <Badge color="amber">{t('inventory.alerts.lowStock')}</Badge>
          : <Badge color="green">{t('inventory.table.inStock')}</Badge>
      ),
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
          {canManageItemMaster && (
            <a
              className="btn btn--ghost btn--sm"
              href={getERPDeskUrl(`item/${encodeURIComponent(row.item_code)}`)}
              target="_blank"
              rel="noreferrer"
            >
              {t('common.edit')}
            </a>
          )}
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

