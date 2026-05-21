import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader, PageLoading, ApiErrorCard, StatCard, Btn, PartialDataBanner } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { hasCapability } from '../../auth/capabilities';
import { DashboardLayout, LayoutSection, TableRegion } from '../../components/layout/page-layouts';
import { getPurchasingAnalytics } from '../../services/purchasingService';
import { getUserFriendlyMessage } from '../../utils/errorHandling';
import { useOperationalRefresh } from '../../services/operationalRefresh';
import { fmtCurrencyCompact } from '../../utils/format';

export default function PurchasingDashboardPage() {
  const { t } = useTranslation();
  const { capabilities } = useAuth();
  const showApprovals = hasCapability(capabilities, 'canViewPurchaseApprovals');
  const [data, setData] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getPurchasingAnalytics()
      .then((result) => {
        setData(result);
        setWarnings(result.warnings || []);
      })
      .catch((e) => {
        setData(null);
        setWarnings([]);
        setError(getUserFriendlyMessage(e));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useOperationalRefresh(load, [load]);

  if (loading) return <PageLoading size={24} />;

  if (error) {
    return (
      <DashboardLayout>
        <PageHeader title={t('nav.purchasing')} subtitle={t('nav.overview')} dense actions={<Btn variant="ghost" size="sm" onClick={load}>{t('common.refresh')}</Btn>} />
        <ApiErrorCard message={error} onRetry={load} />
      </DashboardLayout>
    );
  }

  if (!data) return null;

  const supplierRows = data.frequentSuppliers || [];
  const sparseTable = supplierRows.length > 0 && supplierRows.length <= 8;

  return (
    <DashboardLayout>
      <PageHeader
        title={t('nav.purchasing')}
        subtitle={t('purchasing.subtitle')}
        dense
        actions={<Btn variant="ghost" size="sm" onClick={load}>{t('common.refresh')}</Btn>}
      />

      <PartialDataBanner warnings={warnings} />

      <section className="layout-grid layout-grid--kpi" aria-label="Key metrics">
        <StatCard label={t('nav.suppliers')} value={data.supplierCount} icon="🏭" color="blue" compact />
        <StatCard label={t('purchasing.totalPurchases')} value={fmtCurrencyCompact(data.totalPurchases)} icon="💰" color="accent" compact />
        <StatCard label={t('finance.outstanding')} value={fmtCurrencyCompact(data.totalOutstanding)} icon="📋" color="red" compact />
        <StatCard label={t('purchasing.thisMonth')} value={fmtCurrencyCompact(data.monthPurchases)} icon="📅" color="green" compact />
      </section>

      <LayoutSection variant="flat">
        <div className="workflow-bar">
          <div>
            <h2 className="layout-section__title">{t('purchasing.workflow')}</h2>
            <p className="workflow-bar__desc">
              Supplier → Purchase Receipt → Purchase Invoice (line-item link)
            </p>
          </div>
          <div className="workflow-bar__actions">
            <Link to="/admin/purchasing/receive" className="btn btn--primary btn--sm">{t('purchasing.receiveStock')}</Link>
            {showApprovals && (
              <Link to="/admin/purchasing/approvals" className="btn btn--ghost btn--sm">{t('nav.approvals')}</Link>
            )}
            <Link to="/admin/purchasing/invoices" className="btn btn--ghost btn--sm">{t('purchasing.newInvoice')}</Link>
            <Link to="/admin/purchasing/matching" className="btn btn--ghost btn--sm">{t('nav.matching')}</Link>
            <Link to="/admin/purchasing/suppliers" className="btn btn--ghost btn--sm">{t('nav.suppliers')}</Link>
          </div>
        </div>
      </LayoutSection>

      <LayoutSection
        title={t('purchasing.topSuppliers')}
        subtitle={t('purchasing.byInvoiceValue')}
        variant="raised"
        fit={sparseTable}
        actions={<Link to="/admin/purchasing/reports" className="btn btn--ghost btn--sm">{t('purchasing.fullReport')}</Link>}
      >
        {supplierRows.length === 0 ? (
          <p className="empty-inline">{t('purchasing.noInvoicesYet')}</p>
        ) : (
          <TableRegion fit={sparseTable}>
            <div className="table-wrap table-wrap--compact">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>{t('nav.suppliers')}</th>
                    <th>{t('purchasing.table.inv')}</th>
                    <th>{t('finance.table.total')}</th>
                    <th>{t('finance.outstanding')}</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierRows.map((row) => (
                    <tr key={row.supplier}>
                      <td>
                        <Link to={`/admin/purchasing/suppliers/${encodeURIComponent(row.supplier)}`}>
                          {row.supplier}
                        </Link>
                      </td>
                      <td className="mono">{row.count}</td>
                      <td className="mono">{fmtCurrencyCompact(row.total)}</td>
                      <td className="mono">{fmtCurrencyCompact(row.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableRegion>
        )}
      </LayoutSection>
    </DashboardLayout>
  );
}
