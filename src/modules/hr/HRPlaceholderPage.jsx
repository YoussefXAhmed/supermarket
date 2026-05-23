import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/ui';
import { AdminPageLayout, LayoutSection } from '../../components/layout/page-layouts';

export default function HRPlaceholderPage({ titleKey, descKey, backTo = '/hr' }) {
  const { t } = useTranslation();

  return (
    <AdminPageLayout>
      <PageHeader title={t(titleKey)} subtitle={t(descKey)} dense />
      <LayoutSection variant="raised">
        <p className="page-header__sub">{t('hr.placeholder.comingSoon')}</p>
        <Link to={backTo} className="btn btn--ghost btn--sm">
          {t('nav.hrOverview')}
        </Link>
      </LayoutSection>
    </AdminPageLayout>
  );
}
