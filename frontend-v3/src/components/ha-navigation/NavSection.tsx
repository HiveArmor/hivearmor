/**
 * NavSection — renders a labeled section with nav items.
 */

import { NavItem } from './NavItem';
import type { NavSectionProps } from './types';

export function NavSection({
  title,
  items,
  collapsed,
  currentPath,
  onItemClick,
}: NavSectionProps): JSX.Element {
  if (items.length === 0) return <></>;

  return (
    <section className="ha-nav-section" aria-label={title}>
      {!collapsed && (
        <div className="ha-nav-section__title">
          {title}
        </div>
      )}
      <div>
        {items.map((item) => (
          <NavItem
            key={item.route}
            item={item}
            collapsed={collapsed}
            isActive={currentPath === item.route || currentPath.startsWith(item.route + '/')}
            onClick={() => onItemClick(item.route)}
          />
        ))}
      </div>
    </section>
  );
}
