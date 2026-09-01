import type React from 'react';

import './HaPageHeader.css';

export interface HaBreadcrumbItem {
  label: string;
  href?: string;
}

export interface HaPageTab {
  id: string;
  label: string;
  /** Optional count badge (mono, tabular) shown after the label. */
  count?: number;
  active?: boolean;
  onClick?: () => void;
}

export interface HaPageHeaderProps {
  /** Page title — plain text, no chip/highlight (locked design §8). */
  title: string;
  /** Optional supporting line under the title (identity — scrolls away with the title row). */
  description?: React.ReactNode;
  /** Optional inline node after the title (e.g. a live count badge). */
  badge?: React.ReactNode;
  /** Right-aligned control cluster. Pinned (sticky) via the CSS control strip. */
  actions?: React.ReactNode;
  /**
   * Breadcrumbs. Per the locked design these belong ONLY on drill-down / detail routes — do not
   * pass them on flat top-level pages. Rendered when provided for back-compat.
   */
  breadcrumbs?: HaBreadcrumbItem[];
  /** Optional underline tabs row (only when the page has sub-pages). */
  tabs?: HaPageTab[];
  className?: string;
}

/**
 * HaPageHeader — the locked compact page-context band (design system §8), replacing SiemPageHeader.
 *
 * Compact, **no background fill** (transparent on the app canvas, bottom border only); 36px title
 * row / 34px optional tabs row; plain-text title (no chip); breadcrumbs only on drill-down routes;
 * underline tabs with inline mono count badges. Prop-compatible with SiemPageHeader so the 11
 * existing consumers migrate with no code change; `SiemPageHeader` is re-exported as a deprecated
 * alias.
 *
 * Tokens only (Hive Carbon Hybrid). Replaces SiemPageHeader's filled 64px header + stale aliases.
 */
export function HaPageHeader({
  title,
  description,
  badge,
  actions,
  breadcrumbs,
  tabs,
  className = '',
}: HaPageHeaderProps): JSX.Element {
  return (
    <div className={['ha-page-header', className].filter(Boolean).join(' ')}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="ha-page-header__breadcrumbs" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`}>
              {crumb.href ? (
                <a href={crumb.href} className="ha-page-header__crumb-link">
                  {crumb.label}
                </a>
              ) : (
                <span className="ha-page-header__crumb">{crumb.label}</span>
              )}
              {index < breadcrumbs.length - 1 && (
                <span className="ha-page-header__crumb-sep" aria-hidden="true">
                  ▸
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="ha-page-header__title-row">
        <h1 className="ha-page-header__title">{title}</h1>
        {badge}
        {description && <span className="ha-page-header__meta">{description}</span>}
        <div className="ha-page-header__spacer" />
        {actions && <div className="ha-page-header__actions">{actions}</div>}
      </div>

      {tabs && tabs.length > 0 && (
        <div className="ha-page-header__tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.active ?? false}
              className={['ha-page-header__tab', tab.active ? 'ha-page-header__tab--on' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={tab.onClick}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ha-page-header__tab-count">{tab.count.toLocaleString()}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
