/**
 * Enterprise page layout shells — constrain width on ultrawide displays.
 * POS intentionally excluded (full workspace).
 */

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

function PageLayout({
  variant,
  density = 'compact',
  className = '',
  tableConstrain = false,
  children,
}) {
  return (
    <div
      className={cx(
        'page-layout',
        `page-layout--${variant}`,
        `density--${density}`,
        tableConstrain && 'page-layout--table-fit',
        className
      )}
    >
      {children}
    </div>
  );
}

/** Default admin lists / mixed content */
export function AdminPageLayout({ density = 'compact', className = '', children, ...rest }) {
  return (
    <PageLayout variant="admin" density={density} className={className} {...rest}>
      {children}
    </PageLayout>
  );
}

/** KPI dashboards */
export function DashboardLayout({ density = 'compact', className = '', children, ...rest }) {
  return (
    <PageLayout variant="dashboard" density={density} className={className} {...rest}>
      {children}
    </PageLayout>
  );
}

/** Tables, reports, activity logs */
export function TablePageLayout({
  density = 'compact',
  className = '',
  tableConstrain = false,
  children,
  ...rest
}) {
  return (
    <PageLayout
      variant="table"
      density={density}
      className={className}
      tableConstrain={tableConstrain}
      {...rest}
    >
      {children}
    </PageLayout>
  );
}

/** Create / edit forms */
export function FormPageLayout({ density = 'compact', className = '', children, ...rest }) {
  return (
    <PageLayout variant="form" density={density} className={className} {...rest}>
      {children}
    </PageLayout>
  );
}

/** Analytics & multi-panel charts */
export function AnalyticsLayout({ density = 'compact', className = '', children, ...rest }) {
  return (
    <PageLayout variant="analytics" density={density} className={className} {...rest}>
      {children}
    </PageLayout>
  );
}

/** Section card with hierarchy */
export function LayoutSection({
  title,
  subtitle,
  actions,
  variant = 'raised',
  fit = false,
  flushHead = false,
  className = '',
  children,
}) {
  const hasHead = title || subtitle || actions;
  return (
    <section
      className={cx(
        'layout-section',
        `layout-section--${variant}`,
        fit && 'layout-section--fit',
        className
      )}
    >
      {hasHead && (
        <header
          className={cx(
            'layout-section__head',
            flushHead && 'layout-section__head--flush'
          )}
        >
          <div>
            {title && <h2 className="layout-section__title">{title}</h2>}
            {subtitle && <p className="layout-section__subtitle">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

/** Wrap tables; use fit when row count is small */
export function TableRegion({ fit = false, className = '', children }) {
  return (
    <div className={cx('table-region', fit && 'table-region--fit', className)}>
      {children}
    </div>
  );
}
