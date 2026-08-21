/**
 * HaNavigation — Left sidebar navigation with 7 sections.
 * Reads from sidebar.store and auth.store.
 */

import { useState } from 'react';

import { ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';


import { NavSection } from './NavSection';
import type { NavItemSpec } from './types';

import { UserAvatarMenu } from '@/components/ha-masthead/UserAvatarMenu';
import { useMsspNavStore } from '@/features/mssp/store/msspNavStore';
import { hasAuthority } from '@/lib/auth/hasAuthority';
import { useAuthStore } from '@/store/auth.store';
import { useSidebarStore } from '@/store/sidebar.store';
import { useThemeStore } from '@/store/theme.store';

import './HaNavigation.css';


// Section: COMMAND
const COMMAND_ITEMS: NavItemSpec[] = [
  { label: 'Mission Control', icon: 'LayoutDashboard', route: '/dashboard', roles: [] },
  { label: 'Analyst Queue', icon: 'ShieldAlert', route: '/queue', roles: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'] },
  { label: 'Alerts', icon: 'Bell', route: '/alerts', roles: [] },
  { label: 'Correlated Findings', icon: 'Layers', route: '/correlated-findings', roles: [] },
  { label: 'Incidents', icon: 'Target', route: '/incidents', roles: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'] },
];

// Section: INVESTIGATE
const INVESTIGATE_ITEMS: NavItemSpec[] = [
  { label: 'Search & Hunt', icon: 'Search', route: '/search', roles: [] },
  { label: 'Investigations', icon: 'Monitor', route: '/investigations', roles: [] },
  { label: 'Entities', icon: 'Users', route: '/entities', roles: [] },
  { label: 'Threat Constellation', icon: 'GitBranch', route: '/constellation', roles: [] },
  // Hive Intelligence hidden until SEC-GAP-14 resolved (PD-05)
  // { label: 'Hive Intelligence', icon: 'Brain', route: '/intelligence', roles: [] },
];

// Section: DEFEND
const DEFEND_ITEMS: NavItemSpec[] = [
  { label: 'Detection Rules', icon: 'Zap', route: '/detection-rules', roles: ['ROLE_SOC_MANAGER', 'ROLE_ADMIN'] },
  { label: 'Playbooks', icon: 'BookOpen', route: '/response/playbooks', roles: ['ROLE_SOC_MANAGER', 'ROLE_ADMIN'] },
  { label: 'Response Approvals', icon: 'Gavel', route: '/response/authority', roles: ['ROLE_SOC_MANAGER', 'ROLE_ADMIN'] },
  { label: 'Quarantine & Containment', icon: 'ShieldOff', route: '/response/quarantine', roles: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'] },
  { label: 'Response Library', icon: 'Library', route: '/response/library', roles: [] },
];

// Section: POSTURE
const POSTURE_ITEMS: NavItemSpec[] = [
  { label: 'Assets', icon: 'Server', route: '/posture/assets', roles: [] },
  { label: 'Identities', icon: 'Users', route: '/posture/identities', roles: [] },
  { label: 'Active Directory', icon: 'Network', route: '/posture/active-directory', roles: ['ROLE_SOC_MANAGER', 'ROLE_ADMIN'] },
  { label: 'Exposure', icon: 'ShieldOff', route: '/posture/exposure', roles: [] },
  { label: 'Vulnerabilities', icon: 'Bug', route: '/posture/vulnerabilities', roles: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'] },
  { label: 'CIS Benchmark', icon: 'ClipboardCheck', route: '/posture/cis-benchmark', roles: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'] },
  { label: 'Sensors', icon: 'Activity', route: '/posture/sensors', roles: ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'] },
  { label: 'Compliance', icon: 'CheckSquare', route: '/compliance', roles: [] },
];

// Section: ENDPOINT DEFENSE
const ENDPOINT_ITEMS: NavItemSpec[] = [
  { label: 'Endpoints', icon: 'Monitor', route: '/edr/endpoints', roles: [] },
  { label: 'File Integrity', icon: 'FileSearch', route: '/edr/fim', roles: [] },
  { label: 'Agent Policies', icon: 'Settings', route: '/edr/policies', roles: ['ROLE_ADMIN'] },
];

// Section: DASHBOARDS (placeholder — dynamic list from API in real implementation)
const DASHBOARDS_ITEMS: NavItemSpec[] = [
  { label: 'Studio', icon: 'Pencil', route: '/dashboards/studio', roles: [] },
];

// Section: REPORT
// Note: SITREP, Incident Reports, and AAR are hidden until backend endpoints are implemented
// These can be shown by setting VITE_FEATURE_SITREP_ENABLED, VITE_FEATURE_INCIDENT_REPORTS_ENABLED,
// and VITE_FEATURE_AAR_ENABLED to 'true' respectively
const REPORT_ITEMS: NavItemSpec[] = [
  { label: 'Scheduled Reports', icon: 'Clock', route: '/reports/scheduled', roles: [] },
  // Conditionally include SITREP if feature flag is enabled
  ...(import.meta.env.VITE_FEATURE_SITREP_ENABLED === 'true'
    ? [{ label: 'Security SITREP', icon: 'FileText' as const, route: '/reports/sitrep', roles: [] }]
    : []),
  // Conditionally include Incident Reports if feature flag is enabled
  ...(import.meta.env.VITE_FEATURE_INCIDENT_REPORTS_ENABLED === 'true'
    ? [{ label: 'Incident Reports', icon: 'FileMinus' as const, route: '/reports/incidents', roles: [] }]
    : []),
  // Conditionally include After-Action Review if feature flag is enabled
  ...(import.meta.env.VITE_FEATURE_AAR_ENABLED === 'true'
    ? [{ label: 'After-Action Review', icon: 'ClipboardCheck' as const, route: '/reports/after-action', roles: [] }]
    : []),
];

const MSSP_ADMIN_AUTHORITY = "MSSP_ADMIN";

// Section: ADMINISTRATION (only shown to ROLE_ADMIN)
const ADMINISTRATION_ITEMS: NavItemSpec[] = [
  { label: 'Users', icon: 'UserCog', route: '/admin/users', roles: ['ROLE_ADMIN'] },
  // Tenants hidden until PD-01 multi-tenancy is implemented
  // { label: 'Tenants', icon: 'Building', route: '/admin/tenants', roles: ['ROLE_ADMIN'] },
  { label: 'Integrations', icon: 'Plug', route: '/admin/integrations', roles: ['ROLE_ADMIN'] },
  { label: 'Notifications', icon: 'Bell', route: '/admin/notifications', roles: ['ROLE_ADMIN'] },
  { label: 'Audit Log', icon: 'ClipboardList', route: '/admin/audit', roles: ['ROLE_ADMIN'] },
  { label: 'Pipeline signals', icon: 'Activity', route: '/admin/pipeline-signals', roles: ['ROLE_ADMIN'] },
  { label: 'Settings', icon: 'Settings', route: '/admin/settings', roles: ['ROLE_ADMIN'] },
];

export interface HaNavigationProps {
  // No required props — reads from sidebar and auth stores
}

export function HaNavigation(_props: HaNavigationProps): JSX.Element {
  const { collapsed, toggle } = useSidebarStore();
  const { theme, toggleTheme } = useThemeStore();
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const { hasAnyRole, hasRole } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const isMsspAdmin = hasAuthority(MSSP_ADMIN_AUTHORITY);
  const lastTenantId = useMsspNavStore((s) => s.lastTenantId);

  const handleNavItemClick = (route: string) => {
    navigate(route);
  };

  // Filter items by role
  const filterItemsByRole = (items: NavItemSpec[]) => {
    return items.filter((item) => {
      if (!item.roles || item.roles.length === 0) return true;
      return hasAnyRole(item.roles);
    });
  };

  const commandItems = filterItemsByRole(COMMAND_ITEMS);
  const investigateItems = filterItemsByRole(INVESTIGATE_ITEMS);
  const defendItems = filterItemsByRole(DEFEND_ITEMS);
  const postureItems = filterItemsByRole(POSTURE_ITEMS);
  const endpointItems = filterItemsByRole(ENDPOINT_ITEMS);
  const dashboardsItems = filterItemsByRole(DASHBOARDS_ITEMS);
  const reportItems = filterItemsByRole(REPORT_ITEMS);
  const administrationItems = filterItemsByRole(ADMINISTRATION_ITEMS);

  const showAdministration = hasRole('ROLE_ADMIN');
  const expanded = !collapsed || hoverExpanded;

  // MSSP Portal items — only computed when isMsspAdmin is true
  const msspItems: NavItemSpec[] = isMsspAdmin
    ? [
        { label: 'Overview',   icon: 'LayoutDashboard', route: '/mssp/overview',  roles: [] },
        { label: 'Tenants',    icon: 'Building2',       route: '/mssp/tenants',   roles: [] },
        { label: 'New tenant', icon: 'Plus',            route: '/mssp/tenants/new', roles: [] },
        ...(lastTenantId !== null
          ? [
              {
                label: 'Tenant detail',
                icon: 'FileText',
                route: `/mssp/tenants/${lastTenantId}`,
                roles: [] as string[],
              },
              {
                label: 'Tenant users',
                icon: 'Users',
                route: `/mssp/tenants/${lastTenantId}/users`,
                roles: [] as string[],
              },
            ]
          : []),
      ]
    : [];

  return (
    <nav
      className="ha-navigation"
      data-collapsed={collapsed}
      data-expanded={expanded}
      aria-label="Primary navigation"
      onMouseEnter={() => collapsed && setHoverExpanded(true)}
      onMouseLeave={() => setHoverExpanded(false)}
      onFocus={() => collapsed && setHoverExpanded(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setHoverExpanded(false);
        }
      }}
    >
      {/* Nav sections */}
      <div className="ha-navigation__scroll">
        <NavSection
          title="COMMAND"
          items={commandItems}
          collapsed={!expanded}
          currentPath={location.pathname}
          onItemClick={handleNavItemClick}
        />
        <NavSection
          title="INVESTIGATE"
          items={investigateItems}
          collapsed={!expanded}
          currentPath={location.pathname}
          onItemClick={handleNavItemClick}
        />
        <NavSection
          title="DEFEND"
          items={defendItems}
          collapsed={!expanded}
          currentPath={location.pathname}
          onItemClick={handleNavItemClick}
        />
        <NavSection
          title="POSTURE"
          items={postureItems}
          collapsed={!expanded}
          currentPath={location.pathname}
          onItemClick={handleNavItemClick}
        />
        <NavSection
          title="ENDPOINT DEFENSE"
          items={endpointItems}
          collapsed={!expanded}
          currentPath={location.pathname}
          onItemClick={handleNavItemClick}
        />
        <NavSection
          title="DASHBOARDS"
          items={dashboardsItems}
          collapsed={!expanded}
          currentPath={location.pathname}
          onItemClick={handleNavItemClick}
        />
        <NavSection
          title="REPORT"
          items={reportItems}
          collapsed={!expanded}
          currentPath={location.pathname}
          onItemClick={handleNavItemClick}
        />
        {isMsspAdmin && (
          <NavSection
            title="MSSP Portal"
            items={msspItems}
            collapsed={!expanded}
            currentPath={location.pathname}
            onItemClick={handleNavItemClick}
          />
        )}
        {showAdministration && (
          <NavSection
            title="ADMINISTRATION"
            items={administrationItems}
            collapsed={!expanded}
            currentPath={location.pathname}
            onItemClick={handleNavItemClick}
          />
        )}
      </div>

      {/* Collapse toggle at bottom */}
      <div className="ha-navigation__footer">
        <div className="ha-navigation__footer-tools">
          <UserAvatarMenu compact={!expanded} placement="top" />
          {expanded && (
            <button
              type="button"
              className="ha-navigation__theme"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
            </button>
          )}
        </div>
        <button
          onClick={toggle}
          className="ha-navigation__pin"
          aria-label={collapsed ? 'Pin sidebar open' : 'Use hover expansion'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {expanded && <span className="ha-navigation__pin-label">{collapsed ? 'Pin open' : 'Auto collapse'}</span>}
        </button>
      </div>
    </nav>
  );
}
