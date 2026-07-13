"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn, slugify } from "@/lib/utils";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAlertStreamStore } from "@/store/alert-stream";
import { useIsAdmin } from "@/hooks/use-current-user";
import { dashboardService } from "@/services/dashboard.service";
import {
  // Section / group icons
  Microscope, ShieldAlert, Zap, Server, Scale, PenLine, Lock,
  // Home pinned item
  LayoutDashboard,
  // Investigate items
  AlertTriangle, Search, Siren, Shield, Crosshair, Activity,
  // Detection items
  Globe, UserCheck, ShieldCheck, LayoutGrid,
  // Respond items
  GitBranch, Terminal, ClipboardList, Workflow,
  // Assets items
  Bot, ScanLine, Building2, Radar, Bug,
  // Compliance items
  FileBarChart2, CalendarDays,
  // Content Studio items
  Layers, PieChart, Code2, Puzzle, Database, Tag,
  // Admin items
  Users, Settings, Bell, Braces, Key, Brain, KeyRound, Gauge,
  // UI chrome
  ChevronLeft, ChevronRight, ChevronDown,
} from "lucide-react";

// ─── Sidebar store (used by topbar + app-shell) ────────────────────────────
interface SidebarStore {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: "hivearmor-sidebar" }
  )
);

// ─── Navigation data types ─────────────────────────────────────────────────
interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  children?: NavItem[];
}

interface NavGroup {
  id: string;
  title: string;
  icon: React.ReactNode;
  accent?: string;
  items: NavItem[];
}

interface AdminNavItem extends NavItem { icon: React.ReactNode }
interface AdminGroup {
  id: string;
  title: string;
  items: AdminNavItem[];
}

// ─── Routes hidden from non-admin users in the main SOC nav ───────────────
const ADMIN_ONLY_ROUTES = new Set(["/agents", "/data-sources", "/integrations"]);

// ─── SOC navigation — 6 groups (Monitor removed, Build → Content Studio) ──
const SOC_NAVIGATION: NavGroup[] = [
  {
    id: "investigate",
    title: "Investigate",
    icon: <Microscope className="w-4 h-4" />,
    accent: "var(--color-critical)",
    items: [
      { label: "Alerts",         href: "/alerts",              icon: <AlertTriangle className="w-3.5 h-3.5" /> },
      { label: "Log Explorer",   href: "/logs",                icon: <Search        className="w-3.5 h-3.5" /> },
      { label: "Incidents",      href: "/incidents",           icon: <Siren         className="w-3.5 h-3.5" /> },
      { label: "Cases",          href: "/offenses",            icon: <Shield        className="w-3.5 h-3.5" /> },
      { label: "Adversary Hunt", href: "/alerts/adversary",   icon: <Crosshair     className="w-3.5 h-3.5" /> },
      { label: "Threat Activity",href: "/dashboard/threat-activity", icon: <Activity className="w-3.5 h-3.5" /> },
    ],
  },
  {
    id: "detection",
    title: "Detection",
    icon: <ShieldAlert className="w-4 h-4" />,
    accent: "var(--color-high)",
    items: [
      { label: "Threat Intelligence", href: "/threat-intel",        icon: <Globe       className="w-3.5 h-3.5" /> },
      { label: "Detection Rules",     href: "/rules",               icon: <ShieldCheck className="w-3.5 h-3.5" /> },
      { label: "ATT&CK Coverage",     href: "/rules/coverage",      icon: <LayoutGrid  className="w-3.5 h-3.5" /> },
      { label: "User Behavior",       href: "/uba",                 icon: <UserCheck   className="w-3.5 h-3.5" /> },
    ],
  },
  {
    id: "respond",
    title: "Respond",
    icon: <Zap className="w-4 h-4" />,
    accent: "var(--color-medium)",
    items: [
      { label: "Playbooks",  href: "/soar",         icon: <GitBranch     className="w-3.5 h-3.5" /> },
      { label: "Flow Builder",href: "/soar/flows",  icon: <Workflow      className="w-3.5 h-3.5" /> },
      { label: "Console",    href: "/soar/console", icon: <Terminal      className="w-3.5 h-3.5" /> },
      { label: "SOAR Audit", href: "/soar/audit",   icon: <ClipboardList className="w-3.5 h-3.5" /> },
    ],
  },
  {
    id: "assets",
    title: "Assets",
    icon: <Server className="w-4 h-4" />,
    accent: "var(--color-low)",
    items: [
      { label: "Agents",          href: "/agents",                icon: <Bot       className="w-3.5 h-3.5" /> },
      { label: "EDR",             href: "/edr",                   icon: <ScanLine  className="w-3.5 h-3.5" /> },
      { label: "Active Directory",href: "/active-directory",      icon: <Building2 className="w-3.5 h-3.5" /> },
      { label: "Asset Discovery", href: "/scanner",               icon: <Radar     className="w-3.5 h-3.5" /> },
      { label: "Vulnerability",   href: "/vulnerability-scanner", icon: <Bug       className="w-3.5 h-3.5" /> },
    ],
  },
  {
    id: "compliance",
    title: "Compliance",
    icon: <Scale className="w-4 h-4" />,
    accent: "var(--color-success)",
    items: [
      { label: "Frameworks", href: "/compliance",         icon: <Scale         className="w-3.5 h-3.5" /> },
      { label: "Reports",    href: "/reports",            icon: <FileBarChart2 className="w-3.5 h-3.5" /> },
      { label: "Schedules",  href: "/reports/schedules",  icon: <CalendarDays  className="w-3.5 h-3.5" /> },
    ],
  },
  {
    id: "content-studio",
    title: "Content Studio",
    icon: <PenLine className="w-4 h-4" />,
    accent: "var(--text-muted)",
    items: [
      // children injected dynamically from pinned dashboards
      { label: "My Dashboards", href: "/creator/dashboards",     icon: <Layers   className="w-3.5 h-3.5" />, children: [] },
      { label: "Visualizations",href: "/creator/visualizations", icon: <PieChart className="w-3.5 h-3.5" /> },
      { label: "Data Parsing",  href: "/data-parsing",           icon: <Code2    className="w-3.5 h-3.5" /> },
      { label: "Integrations",  href: "/integrations",           icon: <Puzzle   className="w-3.5 h-3.5" /> },
      { label: "Data Sources",  href: "/data-sources",           icon: <Database className="w-3.5 h-3.5" />, children: [
        { label: "Collectors",        href: "/data-sources/collectors",        icon: <Database className="w-3 h-3" /> },
        { label: "Collector Groups",  href: "/data-sources/collector-groups",  icon: <Database className="w-3 h-3" /> },
        { label: "Groups",            href: "/data-sources/groups",            icon: <Database className="w-3 h-3" /> },
      ]},
      { label: "Alert Tagging", href: "/alerts/tagging-rules",   icon: <Tag      className="w-3.5 h-3.5" /> },
    ],
  },
];

// ─── Admin nav — 4 sub-groups (My Account removed → topbar avatar menu) ───
const ADMIN_NAV_GROUPS: AdminGroup[] = [
  {
    id: "users-access",
    title: "Users & Access",
    items: [
      { label: "Users",              href: "/admin/users",             icon: <Users    className="w-3.5 h-3.5" /> },
      { label: "Identity Providers", href: "/admin/identity-provider", icon: <KeyRound className="w-3.5 h-3.5" /> },
      { label: "Connection Keys",    href: "/admin/connection-keys",   icon: <Key      className="w-3.5 h-3.5" /> },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    items: [
      { label: "Notification Rules", href: "/admin/notifications", icon: <Bell className="w-3.5 h-3.5" /> },
    ],
  },
  {
    id: "ai-engine",
    title: "AI & Engine",
    items: [
      { label: "SOC AI Engine", href: "/settings/soc-ai",  icon: <Brain  className="w-3.5 h-3.5" /> },
      { label: "Variables",     href: "/admin/variables",  icon: <Braces className="w-3.5 h-3.5" /> },
    ],
  },
  {
    id: "platform",
    title: "Platform",
    items: [
      { label: "System Settings",     href: "/admin/settings",            icon: <Settings className="w-3.5 h-3.5" /> },
      { label: "Index Rollover",      href: "/admin/index-rollover",      icon: <Gauge    className="w-3.5 h-3.5" /> },
      { label: "Search Acceleration", href: "/admin/search-acceleration", icon: <Gauge    className="w-3.5 h-3.5" /> },
      { label: "OpenSearch Console",  href: "/opensearch",                icon: <Database className="w-3.5 h-3.5" /> },
    ],
  },
];

// ─── Open incident count hook ──────────────────────────────────────────────
function useOpenIncidentCount(): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const token = typeof window !== "undefined"
        ? localStorage.getItem("hivearmor_auth_token")
        : null;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(
        "/api/ha-incidents?page=0&size=1&incidentStatus.in=OPEN&incidentStatus.in=IN_REVIEW",
        { headers }
      );
      if (!res.ok) return;
      const total = parseInt(res.headers.get("X-Total-Count") || "0", 10);
      if (!isNaN(total)) setCount(total);
    } catch {
      // silent — keep previous count
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  return count;
}

// ─── Sidebar component ─────────────────────────────────────────────────────
export function Sidebar() {
  const pathname   = usePathname();
  const { collapsed, toggle } = useSidebarStore();
  const newAlertCount     = useAlertStreamStore((s) => s.newAlertCount);
  const openIncidentCount = useOpenIncidentCount();
  const isAdmin = useIsAdmin();

  // Accordion expand state — default open: investigate + detection
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(["investigate", "detection"])
  );

  // Sub-expanded tracks NavItems with children (keyed by href)
  const [subExpanded, setSubExpanded] = useState<Set<string>>(new Set());

  // Pinned dashboards from backend
  const [pinnedDashboards, setPinnedDashboards] = useState<NavItem[]>([]);

  // Collapsed flyout state
  const [flyoutGroup, setFlyoutGroup] = useState<string | null>(null);
  const [flyoutTop, setFlyoutTop]     = useState(0);
  const flyoutTimer = useRef<ReturnType<typeof setTimeout>>();
  const groupBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // ── Fetch pinned dashboards
  useEffect(() => {
    dashboardService.listPinned().then((dashboards) => {
      setPinnedDashboards(
        dashboards.map((d) => ({
          label: d.name,
          href:  `/dashboard/render/${d.id}/${slugify(d.name)}`,
          icon:  <Layers className="w-3.5 h-3.5" />,
        }))
      );
    }).catch(() => {});
  }, []);

  // ── Inject pinned dashboards into "My Dashboards" in Content Studio
  const resolvedGroups: NavGroup[] = SOC_NAVIGATION.map((group) =>
    group.id !== "content-studio" ? group : {
      ...group,
      items: group.items.map((item) =>
        item.label !== "My Dashboards" ? item : { ...item, children: pinnedDashboards }
      ),
    }
  );

  // ── Filter admin-only items for non-admin users
  const getVisibleItems = (group: NavGroup): NavItem[] =>
    isAdmin ? group.items : group.items.filter((item) => !ADMIN_ONLY_ROUTES.has(item.href));

  // ── Auto-expand the group containing the active route
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      resolvedGroups.forEach((group) => {
        if (group.items.some((item) =>
          isActive(item.href) || item.children?.some((c) => isActive(c.href))
        )) {
          next.add(group.id);
        }
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, pinnedDashboards]);

  // ── Auto-expand sub-section if a child is active
  useEffect(() => {
    resolvedGroups.forEach((group) => {
      group.items.forEach((item) => {
        if (item.children?.some((c) => isActive(c.href))) {
          setSubExpanded((prev) => { const n = new Set(prev); n.add(item.href); return n; });
        }
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, pinnedDashboards]);

  const toggleGroup = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      void (next.has(id) ? next.delete(id) : next.add(id));
      return next;
    });

  const toggleSub = (href: string) =>
    setSubExpanded((prev) => {
      const next = new Set(prev);
      void (next.has(href) ? next.delete(href) : next.add(href));
      return next;
    });

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/" && pathname?.startsWith(href.split("?")[0] + "/"));

  const isGroupActive = (group: NavGroup) =>
    group.items.some(
      (item) => isActive(item.href) || item.children?.some((c) => isActive(c.href))
    );

  // ── Collapsed flyout handlers
  const openFlyout = (groupId: string) => {
    clearTimeout(flyoutTimer.current);
    const el = groupBtnRefs.current[groupId];
    if (el) setFlyoutTop(el.getBoundingClientRect().top - 4);
    setFlyoutGroup(groupId);
  };

  const closeFlyout = () => {
    flyoutTimer.current = setTimeout(() => setFlyoutGroup(null), 140);
  };

  // ── Badge helper
  const badge = (count: number, color: string) =>
    count > 0 ? (
      <span className={cn(
        "text-micro px-1 py-0.5 rounded-full font-bold min-w-[16px] text-center leading-3 shrink-0",
        color,
      )}>
        {count > 99 ? "99+" : count}
      </span>
    ) : null;

  // ── Render a standard nav item link
  const renderItem = (item: NavItem, group: NavGroup, flyoutMode = false) => {
    const active = isActive(item.href);
    const alertBadge   = item.href === "/alerts"    && badge(newAlertCount,     "bg-critical/20 text-critical");
    const incidentBadge= item.href === "/incidents" && badge(openIncidentCount, "bg-high/20 text-high");
    const activeDot    = active && !alertBadge && !incidentBadge ? (
      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: group.accent || "var(--brand-primary)" }} />
    ) : null;

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={flyoutMode ? () => setFlyoutGroup(null) : undefined}
        className={cn(
          "group/item flex items-center gap-2 px-2 py-1 rounded-md text-tiny transition-all duration-150",
          active
            ? "text-brand bg-brand/10 font-medium"
            : "text-muted hover:text-secondary hover:bg-surface-tertiary/50",
          flyoutMode && "py-1.5",
        )}
      >
        {item.icon && (
          <span className={cn(
            "shrink-0 transition-colors",
            active ? "text-brand" : "text-muted/70 group-hover/item:text-secondary",
          )}>
            {item.icon}
          </span>
        )}
        <span className="truncate flex-1">{item.label}</span>
        {alertBadge}
        {incidentBadge}
        {activeDot}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-8 bottom-0 z-sidebar flex flex-col",
        "transition-all duration-200 ease-smooth",
        collapsed ? "w-[64px]" : "w-[260px]",
      )}
      style={{
        background: "linear-gradient(180deg, #0B0F20 0%, #080C1B 100%)",
        borderRight: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Brand */}
      <div
        className="flex items-center h-12 px-3 border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
            style={{
              background: "var(--brand-primary)",
              boxShadow: "0 0 14px rgba(59,130,246,0.40), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-small font-extrabold tracking-tight leading-tight" style={{ color: "var(--text-brand)", letterSpacing: "-0.01em" }}>
                HiveArmor
              </span>
              <span
                className="text-micro leading-tight font-medium"
                style={{ color: "var(--text-muted)", letterSpacing: "0.10em", fontSize: "9px" }}
              >
                SECURITY INTELLIGENCE
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation scroll area */}
      <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-px">

        {/* ── Home pinned item (always visible, no accordion) */}
        <Link
          href="/dashboard"
          title={collapsed ? "Security Posture" : undefined}
          className={cn(
            "flex items-center gap-2 px-2 py-2 rounded-md mb-1 transition-all duration-150",
            collapsed && "justify-center",
            isActive("/dashboard") && !pathname?.startsWith("/dashboard/")
              ? "text-brand bg-brand/10 font-medium"
              : "text-muted hover:text-secondary hover:bg-surface-tertiary/50",
          )}
        >
          <span className={cn(
            "shrink-0",
            isActive("/dashboard") && !pathname?.startsWith("/dashboard/") ? "text-brand" : "",
          )}>
            <LayoutDashboard className="w-4 h-4" />
          </span>
          {!collapsed && (
            <span className="text-tiny font-semibold truncate">Security Posture</span>
          )}
        </Link>

        <div className="mx-1 border-t border-surface-border/40" />

        {/* ── SOC groups */}
        {resolvedGroups.map((group) => {
          const groupActive = isGroupActive(group);
          const isExpanded  = expanded.has(group.id);
          const visibleItems = getVisibleItems(group);

          return (
            <div key={group.id}>
              {/* Group header */}
              <button
                ref={(el) => { groupBtnRefs.current[group.id] = el; }}
                onMouseEnter={collapsed ? () => openFlyout(group.id) : undefined}
                onMouseLeave={collapsed ? closeFlyout : undefined}
                onClick={() => { if (!collapsed) toggleGroup(group.id); }}
                title={collapsed ? group.title : undefined}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-all duration-150 text-left",
                  groupActive
                    ? "text-primary"
                    : "text-muted hover:text-secondary hover:bg-surface-tertiary/50",
                  collapsed && "justify-center",
                )}
              >
                <span className={cn("shrink-0", groupActive ? "text-brand" : "")}>
                  {group.icon}
                </span>
                {!collapsed && (
                  <>
                    <span className={cn(
                      "flex-1 text-tiny font-bold uppercase truncate",
                      groupActive ? "text-primary" : "text-muted",
                    )}
                    style={{ letterSpacing: "0.07em", fontSize: "11px" }}
                    >
                      {group.title}
                    </span>
                    <ChevronDown className={cn(
                      "w-3 h-3 text-muted/50 transition-transform duration-200 shrink-0",
                      isExpanded ? "rotate-0" : "-rotate-90",
                    )} />
                  </>
                )}
              </button>

              {/* ── Collapsed flyout popover */}
              {collapsed && flyoutGroup === group.id && visibleItems.length > 0 && (
                <div
                  className="fixed z-dropdown bg-surface-primary border border-surface-border rounded-xl shadow-dropdown overflow-hidden"
                  style={{ left: 68, top: flyoutTop, minWidth: 200 }}
                  onMouseEnter={() => clearTimeout(flyoutTimer.current)}
                  onMouseLeave={closeFlyout}
                >
                  <div className="py-1.5 px-1.5">
                    <div className="px-2 py-1 mb-0.5">
                      <span className="text-micro font-semibold uppercase tracking-wider text-muted/60">
                        {group.title}
                      </span>
                    </div>
                    {visibleItems.map((item) => renderItem(item, group, true))}
                  </div>
                </div>
              )}

              {/* ── Expanded accordion items */}
              {!collapsed && isExpanded && (
                <div
                  className="ml-2.5 pl-2.5 mt-px mb-1 border-l border-surface-border space-y-px"
                  style={{ borderColor: group.accent ? `${group.accent}25` : "var(--surface-border)" }}
                >
                  {visibleItems.map((item) => {
                    const active = isActive(item.href);

                    // Item with sub-children (e.g. My Dashboards with pinned list)
                    if (item.children !== undefined) {
                      const subOpen     = subExpanded.has(item.href);
                      const childActive = item.children.some((c) => isActive(c.href));

                      return (
                        <div key={item.href}>
                          <div className={cn(
                            "group/item flex items-center gap-2 px-2 py-1 rounded-md text-tiny transition-all duration-150",
                            (active || childActive)
                              ? "text-brand bg-brand/10 font-medium"
                              : "text-muted hover:text-secondary hover:bg-surface-tertiary/50",
                          )}>
                            <Link href={item.href} className="flex items-center gap-2 flex-1 min-w-0">
                              {item.icon && (
                                <span className={cn(
                                  "shrink-0 transition-colors",
                                  (active || childActive) ? "text-brand" : "text-muted/70 group-hover/item:text-secondary",
                                )}>
                                  {item.icon}
                                </span>
                              )}
                              <span className="truncate">{item.label}</span>
                            </Link>
                            <button
                              onClick={() => toggleSub(item.href)}
                              className="shrink-0 p-0.5 rounded hover:bg-surface-tertiary/70 transition-colors"
                            >
                              <ChevronDown className={cn(
                                "w-3 h-3 text-muted/60 transition-transform duration-200",
                                subOpen ? "rotate-0" : "-rotate-90",
                              )} />
                            </button>
                          </div>

                          {subOpen && (
                            <div className="ml-2.5 pl-2.5 mt-px border-l border-surface-border/60 space-y-px">
                              {item.children.length === 0 ? (
                                <span className="block px-2 py-1 text-tiny text-muted/50 italic">
                                  No pinned dashboards
                                </span>
                              ) : (
                                item.children.map((child) => {
                                  const childActive = isActive(child.href);
                                  return (
                                    <Link
                                      key={child.href}
                                      href={child.href}
                                      className={cn(
                                        "group/child flex items-center gap-2 px-2 py-1 rounded-md text-tiny transition-all duration-150",
                                        childActive
                                          ? "text-brand bg-brand/10 font-medium"
                                          : "text-muted hover:text-secondary hover:bg-surface-tertiary/50",
                                      )}
                                    >
                                      {child.icon && (
                                        <span className={cn(
                                          "shrink-0 transition-colors",
                                          childActive ? "text-brand" : "text-muted/70 group-hover/child:text-secondary",
                                        )}>
                                          {child.icon}
                                        </span>
                                      )}
                                      <span className="truncate flex-1">{child.label}</span>
                                      {childActive && (
                                        <span
                                          className="w-1 h-1 rounded-full shrink-0"
                                          style={{ background: group.accent || "var(--brand-primary)" }}
                                        />
                                      )}
                                    </Link>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Standard flat item
                    return renderItem(item, group);
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Admin section — 4 sub-groups, admin-only */}
        {!collapsed && isAdmin && (
          <div className="pt-2 mt-2 border-t border-surface-border/50">
            <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
              <Lock className="w-3.5 h-3.5 text-muted/60" />
              <span className="text-tiny font-semibold uppercase tracking-wider text-muted/60">
                Admin
              </span>
            </div>
            {ADMIN_NAV_GROUPS.map((adminGroup) => (
              <div key={adminGroup.id} className="mb-2">
                <div className="px-2 pb-0.5">
                  <span className="text-micro text-muted/40 uppercase tracking-widest font-medium">
                    {adminGroup.title}
                  </span>
                </div>
                {adminGroup.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group/item flex items-center gap-2 px-2 py-1 rounded-md text-tiny transition-all duration-150",
                        active
                          ? "text-brand bg-brand/10 font-medium"
                          : "text-muted hover:text-secondary hover:bg-surface-tertiary/50",
                      )}
                    >
                      <span className={cn(
                        "shrink-0 transition-colors",
                        active ? "text-brand" : "text-muted/70 group-hover/item:text-secondary",
                      )}>
                        {item.icon}
                      </span>
                      <span className="truncate flex-1">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-surface-border p-1.5 shrink-0">
        <button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-full flex items-center justify-center h-7 rounded-md text-muted hover:text-secondary hover:bg-surface-tertiary/50 transition-colors"
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <ChevronLeft  className="w-4 h-4" />
          }
        </button>
      </div>
    </aside>
  );
}
