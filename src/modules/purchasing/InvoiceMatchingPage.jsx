import { useEffect, useState } from 'react';
import { ApiErrorCard, Badge, Btn, PageHeader, PageLoading, PartialDataBanner, Table } from '../../components/ui';
import { TablePageLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import { linkReceiptToInvoice } from '../../services/purchasingApi';
import { getInvoiceMatchingRows } from '../../services/purchasingService';
import { getUserFriendlyMessage } from '../../utils/errorHandling';

const fmt = (n) =>
  new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(n || 0);

export default function InvoiceMatchingPage() {
  const [rows, setRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [linking, setLinking] = useState('');
  const [invoiceInputs, setInvoiceInputs] = useState({});

  const load = () => {
    setLoading(true);
    setError('');
    getInvoiceMatchingRows()
      .then(({ rows: data, warnings: w }) => {
        setRows(data);
        setWarnings(w || []);
      })
      .catch((e) => {
        setRows([]);
        setWarnings([]);
        setError(getUserFriendlyMessage(e));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleLink = async (receiptName) => {
    const invoiceName = (invoiceInputs[receiptName] || '').trim();
    if (!invoiceName) return;
    setLinking(receiptName);
    setError('');
    try {
      await linkReceiptToInvoice(receiptName, invoiceName);
      await load();
    } catch (e) {
      setError(getUserFriendlyMessage(e));
    } finally {
      setLinking('');
    }
  };

  const columns = [
    { key: 'receipt', label: 'Receipt', render: (v) => <span className="mono">{v}</span> },
    { key: 'supplier', label: 'Supplier' },
    { key: 'posting_date', label: 'Date' },
    { key: 'grand_total', label: 'Total', render: (v) => fmt(v) },
    {
      key: 'billing_status',
      label: 'Billing',
      render: (v) => (
        <Badge color={v === 'Billed' ? 'green' : v === 'Partly billed' ? 'amber' : 'default'}>
          {v}
        </Badge>
      ),
    },
    {
      key: 'linked',
      label: 'Invoice link',
      render: (v, row) =>
        row.linked ? (
          <Badge color="green">Linked</Badge>
        ) : (
          <Badge color="amber">Unlinked</Badge>
        ),
    },
    {
      key: 'purchase_invoices',
      label: 'Purchase invoice(s)',
      render: (v, row) => {
        if (row.purchase_invoices?.length) {
          return <span className="mono">{row.purchase_invoices.join(', ')}</span>;
        }
        if (row.linked) {
          return <span className="page-header__sub">Billed (no line link returned)</span>;
        }
        return (
          <div className="toolbar__group">
            <input
              className="input toolbar__input-sm"
              placeholder="Draft PINV"
              value={invoiceInputs[row.receipt] || ''}
              onChange={(e) =>
                setInvoiceInputs((prev) => ({ ...prev, [row.receipt]: e.target.value }))
              }
            />
            <Btn
              variant="ghost"
              size="sm"
              loading={linking === row.receipt}
              onClick={() => handleLink(row.receipt)}
            >
              Link
            </Btn>
          </div>
        );
      },
    },
  ];

  const sparse = rows.length > 0 && rows.length <= 8;

  return (
    <TablePageLayout className="page-layout--list-page" tableConstrain={sparse}>
      <PageHeader
        title="Invoice matching"
        subtitle="Match receipts to invoices via Purchase Invoice Item links and billing status"
        dense
        actions={
          <Btn variant="ghost" size="sm" onClick={load}>
            Refresh
          </Btn>
        }
      />
      <PartialDataBanner warnings={warnings} />
      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : (
        <LayoutSection variant="raised" flushHead fit={sparse}>
          <TableRegion fit={sparse}>
            <Table columns={columns} data={rows} compact emptyMsg="No submitted purchase receipts" />
          </TableRegion>
        </LayoutSection>
      )}
    </TablePageLayout>
  );
}
