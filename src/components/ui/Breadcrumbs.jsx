/**
 * <Breadcrumbs> — navigation trail rendered above the page title.
 *
 * Items shape: [{ label, to? }]
 *   - The LAST item is the current page; not clickable.
 *   - Earlier items become <Link> if `to` is set, otherwise plain text.
 *
 * Usage inside PageHeader (Phase 2 extension):
 *   <PageHeader
 *     title="…"
 *     breadcrumbs={[
 *       { label: 'Admin', to: '/admin' },
 *       { label: 'Settings', to: '/admin/settings' },
 *       { label: 'Security' },
 *     ]}
 *   />
 *
 * Standalone usage is also fine — just mount above whatever heading.
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export default function Breadcrumbs({ items, className = '' }) {
  const { t } = useTranslation();
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <nav
      className={`breadcrumbs ${className}`.trim()}
      aria-label={t('ui.breadcrumbs.label', { defaultValue: 'Breadcrumb' })}
    >
      <ol className="breadcrumbs__list">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li
              key={`${item.label}-${i}`}
              className={`breadcrumbs__item ${isLast ? 'breadcrumbs__item--current' : ''}`.trim()}
            >
              {!isLast && item.to ? (
                <Link to={item.to} className="breadcrumbs__link">{item.label}</Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
              )}
              {!isLast && (
                <span className="breadcrumbs__sep" aria-hidden="true">/</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
