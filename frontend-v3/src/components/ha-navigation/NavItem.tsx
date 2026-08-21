/**
 * NavItem — a single nav item with icon, label, active state, badge.
 */

import * as LucideIcons from 'lucide-react';

import type { NavItemSpec } from './types';

export interface NavItemProps {
  item: NavItemSpec;
  collapsed: boolean;
  isActive: boolean;
  onClick: () => void;
}

export function NavItem({ item, collapsed, isActive, onClick }: NavItemProps): JSX.Element {
  const IconComponent = (LucideIcons as Record<string, unknown>)[item.icon] as
    | React.ComponentType<{ size?: number }>
    | undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      className="ha-nav-item"
      aria-current={isActive ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
    >
      {IconComponent && (
        <span className="ha-nav-item__icon" aria-hidden="true">
          <IconComponent size={18} />
        </span>
      )}
      {!collapsed && <span className="ha-nav-item__label">{item.label}</span>}
      {!collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="ha-nav-item__badge">
          {item.badge > 9 ? '9+' : item.badge}
        </span>
      )}
      {collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="ha-nav-item__badge-dot" aria-label={`${item.badge} items`} />
      )}
    </button>
  );
}
