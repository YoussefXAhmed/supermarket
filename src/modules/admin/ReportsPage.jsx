/**
 * Reports launcher — role-filtered.
 *
 * Cards come from the central REPORT_ACCESS matrix in src/auth/reportAccess.js,
 * filtered by `canAccessReport()` against the current user's capabilities. A
 * store manager sees the 4 operational reports; an accountant sees the 5
 * financial reports; an administrator sees all 6.
 *
 * Path links use React Router relative navigation, so the same component
 * works under /admin/reports, /manager/reports, and /finance/reports.
 */
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { EmptyState, PageHeader } from '../../components/ui';
import { DashboardLayout, LayoutSection } from '../../components/layout/page-layouts';
import { getAccessibleReports } from '../../auth/reportAccess';
import { useAuth } from '../../hooks/useAuth';

export default function ReportsPage() {
  const { capabilities } = useAuth();
  const reports = useMemo(() => getAccessibleReports(capabilities), [capabilities]);

  return (
    <DashboardLayout>
      <PageHeader
        title="Reports"
        subtitle="Operational and financial reports — filtered to your role."
        dense
      />
      {reports.length === 0 ? (
        <LayoutSection variant="raised" flushHead>
          <EmptyState
            icon="📊"
            title="No reports available"
            desc="Your role doesn't have access to any reports yet. Speak to a system administrator if you think this is wrong."
          />
        </LayoutSection>
      ) : (
        <LayoutSection variant="raised" flushHead>
          <div className="reports-grid">
            {reports.map((r) => (
              <div key={r.key} className="report-card">
                <span className="report-card__icon">{r.icon}</span>
                <div>
                  <p className="report-card__name">{r.label}</p>
                  <p className="report-card__desc">{r.description}</p>
                </div>
                <Link to={r.path} className="btn btn--primary btn--sm report-card__action">
                  Open →
                </Link>
              </div>
            ))}
          </div>
        </LayoutSection>
      )}
    </DashboardLayout>
  );
}
