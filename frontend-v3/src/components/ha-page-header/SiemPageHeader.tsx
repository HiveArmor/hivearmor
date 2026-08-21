/**
 * SiemPageHeader — Standard page header used at the top of every page.
 */

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface SiemPageHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
}

export function SiemPageHeader({
  title,
  description,
  badge,
  actions,
  breadcrumbs,
  className = '',
}: SiemPageHeaderProps): JSX.Element {
  return (
    <div
      className={className}
      style={{
        minHeight: 64,
        background: 'var(--ha-surface-primary)',
        borderBottom: '1px solid var(--ha-border)',
        padding: '16px 24px',
      }}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div
          style={{
            fontSize: 'var(--ha-text-xs)',
            color: 'var(--ha-text-secondary)',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {breadcrumbs.map((crumb, index) => (
            <span key={index}>
              {crumb.href ? (
                <a href={crumb.href} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {crumb.label}
                </a>
              ) : (
                crumb.label
              )}
              {index < breadcrumbs.length - 1 && ' / '}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1
            style={{
              fontSize: 'var(--ha-text-2xl)',
              fontWeight: 600,
              color: 'var(--ha-text-primary)',
              margin: 0,
            }}
          >
            {title}
          </h1>
          {badge}
        </div>
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {actions}
          </div>
        )}
      </div>
      {description && (
        <div
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
            marginTop: 4,
          }}
        >
          {description}
        </div>
      )}
    </div>
  );
}
