import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/ui';
import { AdminPageLayout, LayoutSection } from '../../components/layout/page-layouts';

export default function HRDashboardPage() {
  const { t } = useTranslation();

  return (
    <AdminPageLayout>
      <PageHeader title={t('nav.hrOverview')} subtitle={t('nav.hrSubtitle')} dense />
      <LayoutSection variant="raised">
        <p className="page-header__sub">{t('nav.hrHint')}</p>
        <Link to="/hr/users" className="btn btn--primary btn--sm">
          {t('nav.users')}
        </Link>
      </LayoutSection>
    </AdminPageLayout>
  );
}
