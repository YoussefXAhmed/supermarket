import { useEffect, useState } from 'react';
import { PageHeader, PageLoading, ApiErrorCard, Table, Btn, Badge, PartialDataBanner } from '../../components/ui';
import { getInvoiceMatchingRows } from '../../services/purchasingService';
import { linkReceiptToInvoice } from '../../services/purchasingApi';
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
        <Badge color={v === 'Billed' ? 'green' : v === 'Partly billed' ? 'amber' : 'default'}>{v}</Badge>
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
          return (
            <span className="mono">{row.purchase_invoices.join(', ')}</span>
          );
        }
        if (row.linked) {
          return <span className="page-header__sub">Billed (no line link returned)</span>;
        }
        return (
          <div className="toolbar__group">
            <input
              className="input"
              style={{ maxWidth: 140 }}
              placeholder="Draft PINV"
              value={invoiceInputs[row.receipt] || ''}
              onChange={(e) => setInvoiceInputs((prev) => ({ ...prev, [row.receipt]: e.target.value }))}
            />
            <Btn variant="ghost" size="sm" loading={linking === row.receipt} onClick={() => handleLink(row.receipt)}>
              Link
            </Btn>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Invoice matching"
        subtitle="Match receipts to invoices via Purchase Invoice Item links and billing status"
        actions={<Btn variant="ghost" size="sm" onClick={load}>Refresh</Btn>}
      />
      <PartialDataBanner warnings={warnings} />
      {loading ? (
        <PageLoading size={26} />
      ) : error ? (
        <ApiErrorCard message={error} onRetry={load} />
      ) : (
        <Table columns={columns} data={rows} emptyMsg="No submitted purchase receipts" />
      )}
    </div>
  );
}
