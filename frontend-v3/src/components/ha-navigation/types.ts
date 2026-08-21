/**
 * Navigation types.
 */

export interface NavItemSpec {
  label: string;
  icon: string; // Lucide icon name
  route: string;
  roles: string[]; // empty array = all authenticated users
  badge?: number; // optional badge count
}

export interface NavSectionProps {
  title: string;
  items: NavItemSpec[];
  collapsed: boolean;
  currentPath: string;
  onItemClick: (route: string) => void;
}
