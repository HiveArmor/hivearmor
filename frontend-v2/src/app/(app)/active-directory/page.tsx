"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Building2, Users, Activity, FileBarChart2,
  RefreshCw, Search, AlertTriangle, CheckCircle,
  Shield, Clock, TrendingUp, Server, ChevronRight,
  ChevronLeft,
} from "lucide-react";
import {
  activeDirectoryService,
  AdUser,
  AdLoginEvent,
  AdOverview,
} from "@/services/active-directory.service";

// ─── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color, sub }: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}) {
  return (
    <div className="border border-surface-border rounded-lg p-4 bg-surface-secondary flex items-start gap-3">
      <div className="p-2 rounded-lg" style={{ background: `${color}18` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <div className="text-h2 font-bold text-primary">{value}</div>
        <div className="text-tiny text-muted">{label}</div>
        {sub && <div className="text-tiny text-muted mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Risk badge ───────────────────────────────────────────────────────────────
function RiskBadge({ score }: { score: number }) {
  const [label, color] =
    score >= 80 ? ["Critical", "var(--color-critical)"] :
    score >= 60 ? ["High",     "var(--color-high)"] :
    score >= 40 ? ["Medium",   "var(--color-medium)"] :
                  ["Low",      "var(--color-success)"];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-tiny font-medium"
      style={{ background: `${color}18`, color }}
    >
      {score} · {label}
    </span>
  );
}

function fmtTs(ts: string) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString();
}

// ─── Error banner ─────────────────────────────────────────────────────────────
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-severity-high/40 bg-severity-high/5 p-4 text-small text-severity-high">
      <p className="font-medium">{message}</p>
      <p className="text-tiny text-muted mt-1">
        Check that the <code>user-auditor</code> service is running at{" "}
        <code>http://user-auditor:8080</code>.
      </p>
    </div>
  );
}

// ─── Pagination bar ───────────────────────────────────────────────────────────
function Pagination({ page, total, size, onPage }: {
  page: number;
  total: number;
  size: number;
  onPage: (p: number) => void;
}) {
  const lastPage = Math.max(0, Math.ceil(total / size) - 1);
  if (total <= size) return null;
  return (
    <div className="flex items-center justify-between px-2 pt-3 text-tiny text-muted">
      <span>{total} total</span>
      <div className="flex items-center gap-1">
        <button
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          className="p-1 rounded hover:bg-surface-tertiary disabled:opacity-40"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span>Page {page + 1} / {lastPage + 1}</span>
        <button
          disabled={page >= lastPage}
          onClick={() => onPage(page + 1)}
          className="p-1 rounded hover:bg-surface-tertiary disabled:opacity-40"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
type Tab = "overview" | "users" | "tracker" | "reports";
const PAGE_SIZE = 25;

export default function ActiveDirectoryPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);

  // Users state
  const [users, setUsers] = useState<AdUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(0);
  const [userSearch, setUserSearch] = useState("");
  const [usersError, setUsersError] = useState<string | null>(null);

  // Events state
  const [events, setEvents] = useState<AdLoginEvent[]>([]);
  const [eventTotal, setEventTotal] = useState(0);
  const [eventPage, setEventPage] = useState(0);
  const [eventFilter, setEventFilter] = useState<"all" | "anomaly" | "failed">("all");
  const [eventsError, setEventsError] = useState<string | null>(null);

  // Overview is derived from the users call
  const [overview, setOverview] = useState<AdOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Load overview (first page of users, large size for better stat accuracy)
  useEffect(() => {
    setOverviewLoading(true);
    setUsersError(null);
    activeDirectoryService
      .listUsers({ page: 0, size: 100 })
      .then(({ data, total }) => {
        setOverview(activeDirectoryService.deriveOverview(data, total));
      })
      .catch(() => setUsersError("Failed to load AD data from user-auditor service."))
      .finally(() => setOverviewLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Load users tab
  useEffect(() => {
    if (activeTab !== "users") return;
    setLoading(true);
    setUsersError(null);
    activeDirectoryService
      .listUsers({ page: userPage, size: PAGE_SIZE })
      .then(({ data, total }) => {
        setUsers(data);
        setUserTotal(total);
      })
      .catch(() => setUsersError("Failed to load user list."))
      .finally(() => setLoading(false));
  }, [activeTab, userPage, refreshKey]);

  // Load tracker tab
  useEffect(() => {
    if (activeTab !== "tracker") return;
    setLoading(true);
    setEventsError(null);
    activeDirectoryService
      .listEvents({ page: eventPage, size: PAGE_SIZE })
      .then(({ data, total }) => {
        setEvents(data);
        setEventTotal(total);
      })
      .catch(() => setEventsError("Failed to load authentication events."))
      .finally(() => setLoading(false));
  }, [activeTab, eventPage, refreshKey]);

  const filteredUsers = users.filter(u =>
    userSearch === "" ||
    u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.department.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredEvents = events.filter(e =>
    eventFilter === "all"     ? true :
    eventFilter === "anomaly" ? e.anomaly :
    !e.success
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <Building2  className="w-3.5 h-3.5" /> },
    { id: "users",    label: "Users",    icon: <Users      className="w-3.5 h-3.5" /> },
    { id: "tracker",  label: "Tracker",  icon: <Activity   className="w-3.5 h-3.5" /> },
    { id: "reports",  label: "Reports",  icon: <FileBarChart2 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: "var(--brand-primary)18" }}>
            <Building2 className="w-5 h-5" style={{ color: "var(--brand-primary)" }} />
          </div>
          <div>
            <h1 className="text-h1 text-primary">Active Directory</h1>
            <p className="text-small text-muted">Identity & authentication monitoring for your domain</p>
          </div>
        </div>
        <button
          onClick={() => { setRefreshKey(k => k + 1); setUserPage(0); setEventPage(0); }}
          className="btn-ghost p-2"
          title="Refresh"
        >
          <RefreshCw className={cn("w-4 h-4 text-muted", (loading || overviewLoading) && "animate-spin")} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 border-b border-surface-border shrink-0 mt-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-small border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-brand text-brand font-medium"
                : "border-transparent text-muted hover:text-secondary"
            )}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {usersError && <ErrorBanner message={usersError} />}

            {overviewLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border border-surface-border rounded-lg p-4 bg-surface-secondary h-20 animate-pulse" />
                ))}
              </div>
            ) : overview ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <KpiCard label="Total Users"         value={overview.totalUsers}          icon={<Users         className="w-4 h-4" />} color="var(--brand-primary)" />
                <KpiCard label="Active Users"        value={overview.activeUsers}         icon={<CheckCircle   className="w-4 h-4" />} color="var(--color-success)" />
                <KpiCard label="Locked Accounts"     value={overview.lockedUsers}         icon={<Shield        className="w-4 h-4" />} color="var(--color-high)" />
                <KpiCard label="Failed Logins 24h"   value={overview.failedLoginsLast24h} icon={<AlertTriangle className="w-4 h-4" />} color="var(--color-critical)" />
                <KpiCard label="Anomalies Detected"  value={overview.anomaliesDetected}   icon={<TrendingUp    className="w-4 h-4" />} color="var(--color-medium)" />
                <KpiCard label="Privileged Accounts" value={overview.privilegedAccounts}  icon={<Server        className="w-4 h-4" />} color="var(--text-muted)" />
              </div>
            ) : null}

            {/* Recent authentication events preview */}
            <div className="border border-surface-border rounded-lg">
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
                <h3 className="text-h3 text-primary">Recent Authentication Events</h3>
                <button
                  onClick={() => setActiveTab("tracker")}
                  className="text-tiny text-brand hover:underline flex items-center gap-1"
                >
                  View all <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              {events.length === 0 ? (
                <div className="px-4 py-6 text-center text-small text-muted">
                  Switch to the Tracker tab to load authentication events.
                </div>
              ) : (
                <div className="divide-y divide-surface-border">
                  {events.slice(0, 5).map(e => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", e.success ? "bg-brand" : "bg-severity-critical")} />
                      <span className="text-small font-medium text-primary w-28 truncate">{e.username}</span>
                      <span className="text-tiny text-muted font-mono flex-1">{e.sourceIp}</span>
                      <span className="text-tiny text-muted">{fmtTs(e.timestamp)}</span>
                      {e.anomaly && (
                        <span className="text-tiny px-1.5 py-0.5 rounded bg-warning/15 text-warning shrink-0">
                          ⚠ {e.anomalyReason}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* USERS */}
        {activeTab === "users" && (
          <div className="space-y-4">
            {usersError && <ErrorBanner message={usersError} />}

            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input
                  className="input-base pl-8 text-small w-full"
                  placeholder="Search users, department…"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                />
              </div>
              <span className="text-tiny text-muted">{filteredUsers.length} shown</span>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="border border-surface-border rounded-lg p-3 animate-pulse bg-surface-secondary h-10" />
                ))}
              </div>
            ) : (
              <>
                <div className="border border-surface-border rounded-lg overflow-hidden">
                  <table className="w-full text-small">
                    <thead>
                      <tr className="border-b border-surface-border bg-surface-secondary">
                        <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">User</th>
                        <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Department</th>
                        <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Status</th>
                        <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Risk</th>
                        <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Last Login</th>
                        <th className="px-4 py-2.5 text-left text-tiny font-semibold text-muted uppercase tracking-wider">Groups</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-small text-muted">
                            {userSearch ? "No users match your search." : "No users found. Ensure the user-auditor service is connected."}
                          </td>
                        </tr>
                      ) : filteredUsers.map(u => (
                        <tr key={u.id} className="hover:bg-surface-tertiary/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-primary">{u.displayName || u.username}</div>
                            <div className="text-tiny text-muted font-mono">{u.username}</div>
                          </td>
                          <td className="px-4 py-2.5 text-muted">{u.department || "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-tiny font-medium",
                              u.status === "active"   ? "bg-brand/10 text-brand" :
                              u.status === "locked"   ? "bg-severity-high/15 text-severity-high" :
                              "bg-surface-tertiary text-muted"
                            )}>
                              {u.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5"><RiskBadge score={u.riskScore} /></td>
                          <td className="px-4 py-2.5 text-muted text-tiny">{fmtTs(u.lastLogin)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {u.groups.slice(0, 2).map(g => (
                                <span key={g} className="text-tiny px-1.5 py-0.5 rounded bg-surface-tertiary text-muted">{g}</span>
                              ))}
                              {u.groups.length > 2 && (
                                <span className="text-tiny text-muted">+{u.groups.length - 2}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={userPage} total={userTotal} size={PAGE_SIZE} onPage={setUserPage} />
              </>
            )}
          </div>
        )}

        {/* TRACKER */}
        {activeTab === "tracker" && (
          <div className="space-y-4">
            {eventsError && <ErrorBanner message={eventsError} />}

            <div className="flex items-center gap-2">
              {(["all", "anomaly", "failed"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setEventFilter(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-small transition-colors capitalize",
                    eventFilter === f
                      ? "bg-brand/10 text-brand font-medium"
                      : "text-muted hover:text-secondary hover:bg-surface-tertiary/50"
                  )}
                >
                  {f === "all" ? "All Events" : f === "anomaly" ? "Anomalies Only" : "Failed Logins"}
                </button>
              ))}
              <span className="ml-auto text-tiny text-muted">{filteredEvents.length} events</span>
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border border-surface-border rounded-lg p-4 animate-pulse bg-surface-secondary h-14" />
                ))}
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="border border-surface-border rounded-lg px-4 py-10 text-center text-small text-muted">
                No authentication events found for the last 24 hours.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {filteredEvents.map(e => (
                    <div key={e.id} className={cn(
                      "border rounded-lg px-4 py-3 flex items-start gap-3",
                      e.anomaly
                        ? "border-severity-high/40 bg-severity-high/5"
                        : e.success
                        ? "border-surface-border"
                        : "border-severity-critical/30 bg-severity-critical/5"
                    )}>
                      <div className="shrink-0 mt-0.5">
                        {e.success
                          ? <CheckCircle   className="w-4 h-4 text-brand" />
                          : <AlertTriangle className="w-4 h-4 text-severity-critical" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-primary text-small">{e.username || "—"}</span>
                          {e.sourceIp && <><span className="text-tiny text-muted">from</span><span className="font-mono text-tiny text-secondary">{e.sourceIp}</span></>}
                          {e.workstation && <><span className="text-tiny text-muted">on</span><span className="text-tiny text-muted">{e.workstation}</span></>}
                          {e.anomaly && (
                            <span className="text-tiny px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                              Anomaly
                            </span>
                          )}
                        </div>
                        {e.anomalyReason && (
                          <p className="text-tiny text-muted mt-0.5">{e.anomalyReason}</p>
                        )}
                      </div>
                      <div className="text-tiny text-muted shrink-0 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmtTs(e.timestamp)}
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={eventPage} total={eventTotal} size={PAGE_SIZE} onPage={setEventPage} />
              </>
            )}
          </div>
        )}

        {/* REPORTS — no backend endpoint exists yet */}
        {activeTab === "reports" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-h2 text-primary">Scheduled AD Reports</h2>
            </div>
            <div className="border border-surface-border rounded-lg px-6 py-16 text-center">
              <FileBarChart2 className="w-10 h-10 text-muted mx-auto mb-3 opacity-40" />
              <p className="text-small text-muted">AD reporting is not yet available.</p>
              <p className="text-tiny text-muted mt-1 opacity-70">
                The <code>user-auditor</code> reports endpoint has not been implemented.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
