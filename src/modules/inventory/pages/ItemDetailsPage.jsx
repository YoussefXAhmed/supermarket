import { useState } from 'react';
import MovementTimeline from '../../../components/inventory/MovementTimeline';
import { ApiErrorCard, Badge, Btn, EmptyState, PageHeader, PageLoading, Table } from '../../../components/ui';
import { AdminPageLayout, LayoutSection, TableRegion } from '../../../components/layout/page-layouts';
import { getItemDetails, listBatches, listBins } from '../../../services/inventoryApi';
import { getItemMovementTimeline } from '../../../services/inventoryService';
import { getUserFriendlyMessage } from '../../../utils/errorHandling';
import { useInventoryCapabilities } from '../../../hooks/useInventoryCapabilities';

export default function ItemDetailsPage() {
  const { canInventoryViewValuation } = useInventoryCapabilities();
  const [itemCode, setItemCode] = useState('');
  const [item, setItem] = useState(null);
  const [bins, setBins] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!itemCode.trim()) return;
    setLoading(true);
    setError('');
    const code = itemCode.trim();
    try {
      const [itemRes, binsRes, timelineRows] = await Promise.all([
        getItemDetails(code),
        listBins({ limit: 500, filters: [['item_code', '=', code]] }),
        getItemMovementTimeline(code, { limit: 80 }),
      ]);
      const itemDoc = itemRes?.data?.data || null;
      setItem(itemDoc);
      setBins(binsRes?.data?.data || []);
      setTimeline(timelineRows);

      if (itemDoc?.has_batch_no) {
        const batchRes = await listBatches({ filters: [['item', '=', code]], limit: 50 });
        setBatches(batchRes?.data?.data || []);
      } else {
        setBatches([]);
      }
    } catch (e) {
      setItem(null);
      setBins([]);
      setTimeline([]);
      setBatches([]);
      setError(getUserFriendlyMessage(e, 'Failed to load item details'));
    } finally {
      setLoading(false);
    }
  };

  const binColumns = [
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'actual_qty', label: 'Actual', render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'reserved_qty', label: 'Reserved', render: (v) => <span className="mono">{Number(v || 0).toFixed(2)}</span> },
    { key: 'valuation_rate', label: 'Valuation', render: (v) => `EGP ${Number(v || 0).toFixed(2)}` },
  ];

  const batchColumns = [
    { key: 'name', label: 'Batch', render: (v) => <span className="mono">{v}</span> },
    { key: 'batch_qty', label: 'Qty', render: (v) => Number(v || 0).toFixed(2) },
    { key: 'expiry_date', label: 'Expiry' },
  ];

  return (
    <AdminPageLayout>
      <PageHeader title="Item Details" subtitle="Stock, batches, and movement timeline" dense />

      <LayoutSection variant="flat" flushHead>
        <div className="toolbar">
          <div className="toolbar__group">
            <input
              className="input toolbar__input-sm"
              placeholder="Item code"
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
            <Btn variant="ghost" size="sm" onClick={load}>
              Load item
            </Btn>
          </div>
        </div>
      </LayoutSection>

      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : !item ? (
        <EmptyState icon="🧾" title="No item loaded" desc="Enter item code and click Load item." />
      ) : (
        <>
          <LayoutSection
            variant="raised"
            title={item.item_name || item.item_code}
            subtitle="Item master"
          >
            <div className="meta-grid">
              <p>
                <strong>Code:</strong> <span className="mono">{item.item_code}</span>
              </p>
              <p>
                <strong>Group:</strong> {item.item_group || '—'}
              </p>
              <p>
                <strong>UOM:</strong> {item.stock_uom || '—'}
              </p>
              {canInventoryViewValuation ? (
                <p>
                  <strong>Rate:</strong> EGP {Number(item.standard_rate || 0).toFixed(2)}
                </p>
              ) : null}
              {item.has_batch_no ? <p><Badge color="blue">Batch tracked</Badge></p> : null}
            </div>
          </LayoutSection>

          <LayoutSection variant="raised" title="Warehouse stock">
            {bins.length === 0 ? (
              <EmptyState title="No bin records" />
            ) : (
              <TableRegion>
                <Table columns={binColumns} data={bins} compact />
              </TableRegion>
            )}
          </LayoutSection>

          {batches.length > 0 && (
            <LayoutSection variant="raised" title="Batches">
              <TableRegion>
                <Table columns={batchColumns} data={batches} compact />
              </TableRegion>
            </LayoutSection>
          )}

          <LayoutSection variant="raised" title="Movement timeline">
            <MovementTimeline rows={timeline} />
          </LayoutSection>
        </>
      )}
    </AdminPageLayout>
  );
}
