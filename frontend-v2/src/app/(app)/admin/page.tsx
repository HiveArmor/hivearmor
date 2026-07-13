"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Cpu,
  Database,
  Download,
  Edit2,
  HardDrive,
  KeyRound,
  Layers,
  Lock,
  MemoryStick,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Shield,
  ShieldCheck,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading-skeleton";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

type Tab = "users" | "roles" | "audit" | "health";
type UserRole = "Admin" | "SOC Manager" | "Analyst" | "Viewer";
type UserStatus = "Active" | "Inactive" | "Pending";
type ActionType = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "EXPORT" | "RESET";
type ServiceStatus = "Running" | "Degraded" | "Stopped";

interface SiemUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastLogin: Date | null;
  twoFA: boolean;
  initials: string;
  color: string;
}

interface RolePermissions {
  role: UserRole;
  userCount: number;
  color: string;
  description: string;
  permissions: Record<string, { read: boolean; write: boolean; delete: boolean }>;
}

interface AuditEntry {
  id: string;
  timestamp: Date;
  user: string;
  userEmail: string;
  action: ActionType;
  resource: string;
  details: string;
  ip: string;
}

interface ServiceRow {
  name: string;
  displayName: string;
  status: ServiceStatus;
  pid: number | null;
  uptime: string;
  memoryMb: number;
  cpuPct: number;
  icon: React.ReactNode;
}

interface HealthKpi {
  label: string;
  value: string | number;
  unit?: string;
  status: "ok" | "warn" | "critical";
  icon: React.ReactNode;
}

// ─────────────────────────────────────────────────────────────────
// Demo data
// ─────────────────────────────────────────────────────────────────

const DEMO_USERS: SiemUser[] = [
  {
    id: "u1",
    name: "Morgan Hayes",
    email: "mhayes@hivearmor.io",
    role: "Admin",
    status: "Active",
    lastLogin: new Date("2026-07-04T08:12:00"),
    twoFA: true,
    initials: "MH",
    color: "bg-brand/20 text-brand",
  },
  {
    id: "u2",
    name: "Priya Desai",
    email: "pdesai@hivearmor.io",
    role: "SOC Manager",
    status: "Active",
    lastLogin: new Date("2026-07-04T07:45:00"),
    twoFA: true,
    initials: "PD",
    color: "bg-purple-500/20 text-purple-400",
  },
  {
    id: "u3",
    name: "Tomás Herrero",
    email: "therrero@hivearmor.io",
    role: "Analyst",
    status: "Active",
    lastLogin: new Date("2026-07-04T06:30:00"),
    twoFA: true,
    initials: "TH",
    color: "bg-sky-500/20 text-sky-400",
  },
  {
    id: "u4",
    name: "Aisha Okonkwo",
    email: "aokonkwo@hivearmor.io",
    role: "Analyst",
    status: "Active",
    lastLogin: new Date("2026-07-03T22:15:00"),
    twoFA: false,
    initials: "AO",
    color: "bg-amber-500/20 text-amber-400",
  },
  {
    id: "u5",
    name: "Ryan Blackwell",
    email: "rblackwell@hivearmor.io",
    role: "Viewer",
    status: "Active",
    lastLogin: new Date("2026-07-03T14:00:00"),
    twoFA: false,
    initials: "RB",
    color: "bg-emerald-500/20 text-emerald-400",
  },
  {
    id: "u6",
    name: "Nadia Volkov",
    email: "nvolkov@hivearmor.io",
    role: "Analyst",
    status: "Inactive",
    lastLogin: new Date("2026-06-28T10:00:00"),
    twoFA: true,
    initials: "NV",
    color: "bg-rose-500/20 text-rose-400",
  },
  {
    id: "u7",
    name: "Kai Nakamura",
    email: "knakamura@hivearmor.io",
    role: "SOC Manager",
    status: "Pending",
    lastLogin: null,
    twoFA: false,
    initials: "KN",
    color: "bg-indigo-500/20 text-indigo-400",
  },
  {
    id: "u8",
    name: "Sara Lindqvist",
    email: "slindqvist@hivearmor.io",
    role: "Viewer",
    status: "Pending",
    lastLogin: null,
    twoFA: false,
    initials: "SL",
    color: "bg-teal-500/20 text-teal-400",
  },
];

const MODULES = [
  "Dashboard",
  "Alerts",
  "Incidents",
  "Logs",
  "Rules",
  "SOAR",
  "Compliance",
  "Reports",
  "Settings",
];

const DEMO_ROLES: RolePermissions[] = [
  {
    role: "Admin",
    userCount: 1,
    color: "text-brand",
    description: "Full system access with user and configuration management",
    permissions: Object.fromEntries(
      MODULES.map((m) => [m, { read: true, write: true, delete: true }])
    ),
  },
  {
    role: "SOC Manager",
    userCount: 2,
    color: "text-purple-400",
    description: "Oversight of SOC operations, incident assignment, reporting",
    permissions: Object.fromEntries(
      MODULES.map((m) => [
        m,
        {
          read: true,
          write: m !== "Settings",
          delete: ["Alerts", "Incidents", "Reports"].includes(m),
        },
      ])
    ),
  },
  {
    role: "Analyst",
    userCount: 3,
    color: "text-sky-400",
    description: "Investigate alerts and incidents, write rules and playbooks",
    permissions: Object.fromEntries(
      MODULES.map((m) => [
        m,
        {
          read: true,
          write: ["Alerts", "Incidents", "Rules", "SOAR"].includes(m),
          delete: false,
        },
      ])
    ),
  },
  {
    role: "Viewer",
    userCount: 2,
    color: "text-emerald-400",
    description: "Read-only access for stakeholders and auditors",
    permissions: Object.fromEntries(
      MODULES.map((m) => [
        m,
        {
          read: !["Settings"].includes(m),
          write: false,
          delete: false,
        },
      ])
    ),
  },
];

const DEMO_AUDIT: AuditEntry[] = [
  {
    id: "a1",
    timestamp: new Date("2026-07-04T08:14:22"),
    user: "Morgan Hayes",
    userEmail: "mhayes@hivearmor.io",
    action: "UPDATE",
    resource: "User / knakamura@hivearmor.io",
    details: 'Role changed from "Analyst" to "SOC Manager"',
    ip: "10.0.1.45",
  },
  {
    id: "a2",
    timestamp: new Date("2026-07-04T08:12:00"),
    user: "Morgan Hayes",
    userEmail: "mhayes@hivearmor.io",
    action: "LOGIN",
    resource: "Auth",
    details: "Successful login via SAML SSO",
    ip: "10.0.1.45",
  },
  {
    id: "a3",
    timestamp: new Date("2026-07-04T07:58:11"),
    user: "Priya Desai",
    userEmail: "pdesai@hivearmor.io",
    action: "CREATE",
    resource: "Incident / INC-2041",
    details: "Created incident from alert cluster #4892",
    ip: "10.0.2.12",
  },
  {
    id: "a4",
    timestamp: new Date("2026-07-04T07:45:30"),
    user: "Priya Desai",
    userEmail: "pdesai@hivearmor.io",
    action: "LOGIN",
    resource: "Auth",
    details: "Successful login via MFA",
    ip: "10.0.2.12",
  },
  {
    id: "a5",
    timestamp: new Date("2026-07-04T07:22:00"),
    user: "Tomás Herrero",
    userEmail: "therrero@hivearmor.io",
    action: "UPDATE",
    resource: "Rule / rule-lateral-movement-smb",
    details: "Severity threshold changed from Medium to High",
    ip: "10.0.3.88",
  },
  {
    id: "a6",
    timestamp: new Date("2026-07-04T07:01:55"),
    user: "Aisha Okonkwo",
    userEmail: "aokonkwo@hivearmor.io",
    action: "EXPORT",
    resource: "Reports / Compliance-Q2-2026",
    details: "Exported 142-page compliance report as PDF",
    ip: "192.168.4.77",
  },
  {
    id: "a7",
    timestamp: new Date("2026-07-04T06:45:00"),
    user: "Tomás Herrero",
    userEmail: "therrero@hivearmor.io",
    action: "LOGIN",
    resource: "Auth",
    details: "Successful login",
    ip: "10.0.3.88",
  },
  {
    id: "a8",
    timestamp: new Date("2026-07-04T06:30:00"),
    user: "Aisha Okonkwo",
    userEmail: "aokonkwo@hivearmor.io",
    action: "DELETE",
    resource: "Alert / ALT-7731",
    details: "Alert suppressed — confirmed false positive",
    ip: "192.168.4.77",
  },
  {
    id: "a9",
    timestamp: new Date("2026-07-04T05:10:22"),
    user: "Morgan Hayes",
    userEmail: "mhayes@hivearmor.io",
    action: "CREATE",
    resource: "Integration / crowdstrike-edr",
    details: "New CrowdStrike Falcon integration added",
    ip: "10.0.1.45",
  },
  {
    id: "a10",
    timestamp: new Date("2026-07-04T04:58:00"),
    user: "Morgan Hayes",
    userEmail: "mhayes@hivearmor.io",
    action: "UPDATE",
    resource: "Settings / retention-policy",
    details: "Log retention extended from 90 to 365 days",
    ip: "10.0.1.45",
  },
  {
    id: "a11",
    timestamp: new Date("2026-07-03T23:40:00"),
    user: "Nadia Volkov",
    userEmail: "nvolkov@hivearmor.io",
    action: "LOGOUT",
    resource: "Auth",
    details: "Session ended (timeout after 4h)",
    ip: "10.0.5.200",
  },
  {
    id: "a12",
    timestamp: new Date("2026-07-03T22:30:15"),
    user: "Ryan Blackwell",
    userEmail: "rblackwell@hivearmor.io",
    action: "EXPORT",
    resource: "Logs / windows-security-2026-07-03",
    details: "Exported 2,400 log events to CSV",
    ip: "172.16.1.9",
  },
  {
    id: "a13",
    timestamp: new Date("2026-07-03T21:15:00"),
    user: "Priya Desai",
    userEmail: "pdesai@hivearmor.io",
    action: "UPDATE",
    resource: "Incident / INC-2038",
    details: 'Status changed from "Investigating" to "Resolved"',
    ip: "10.0.2.12",
  },
  {
    id: "a14",
    timestamp: new Date("2026-07-03T18:05:44"),
    user: "Morgan Hayes",
    userEmail: "mhayes@hivearmor.io",
    action: "RESET",
    resource: "User / nvolkov@hivearmor.io",
    details: "Password reset email sent",
    ip: "10.0.1.45",
  },
  {
    id: "a15",
    timestamp: new Date("2026-07-03T14:00:00"),
    user: "Ryan Blackwell",
    userEmail: "rblackwell@hivearmor.io",
    action: "LOGIN",
    resource: "Auth",
    details: "Successful login",
    ip: "172.16.1.9",
  },
];

function buildDemoServices(): ServiceRow[] {
  return [
    {
      name: "hivearmor-backend",
      displayName: "HiveArmor Backend",
      status: "Running",
      pid: 1842,
      uptime: "12d 04h 17m",
      memoryMb: 412,
      cpuPct: 3.2,
      icon: <Shield className="w-4 h-4 text-brand" />,
    },
    {
      name: "opensearch",
      displayName: "OpenSearch",
      status: "Running",
      pid: 1104,
      uptime: "12d 04h 17m",
      memoryMb: 2048,
      cpuPct: 8.7,
      icon: <Database className="w-4 h-4 text-sky-400" />,
    },
    {
      name: "postgresql",
      displayName: "PostgreSQL",
      status: "Running",
      pid: 892,
      uptime: "12d 04h 17m",
      memoryMb: 384,
      cpuPct: 1.4,
      icon: <Database className="w-4 h-4 text-emerald-400" />,
    },
    {
      name: "redis",
      displayName: "Redis",
      status: "Running",
      pid: 1023,
      uptime: "12d 04h 17m",
      memoryMb: 128,
      cpuPct: 0.5,
      icon: <Activity className="w-4 h-4 text-red-400" />,
    },
    {
      name: "kafka",
      displayName: "Apache Kafka",
      status: "Degraded",
      pid: 2201,
      uptime: "2h 43m",
      memoryMb: 768,
      cpuPct: 22.1,
      icon: <Layers className="w-4 h-4 text-amber-400" />,
    },
    {
      name: "nginx",
      displayName: "Nginx (Reverse Proxy)",
      status: "Running",
      pid: 512,
      uptime: "12d 04h 17m",
      memoryMb: 64,
      cpuPct: 0.8,
      icon: <Server className="w-4 h-4 text-lime-400" />,
    },
    {
      name: "agent-manager",
      displayName: "Agent Manager",
      status: "Running",
      pid: 3310,
      uptime: "12d 04h 17m",
      memoryMb: 220,
      cpuPct: 1.9,
      icon: <UserCheck className="w-4 h-4 text-purple-400" />,
    },
    {
      name: "correlation-engine",
      displayName: "Correlation Engine",
      status: "Stopped",
      pid: null,
      uptime: "—",
      memoryMb: 0,
      cpuPct: 0,
      icon: <Activity className="w-4 h-4 text-rose-400" />,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────
// Small helper components
// ─────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: UserRole }) {
  const map: Record<UserRole, string> = {
    Admin: "bg-brand/15 text-brand border-brand/20",
    "SOC Manager": "bg-purple-500/15 text-purple-400 border-purple-500/20",
    Analyst: "bg-sky-500/15 text-sky-400 border-sky-500/20",
    Viewer: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-tiny font-medium border",
        map[role]
      )}
    >
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: UserStatus }) {
  const map: Record<UserStatus, string> = {
    Active: "bg-success/15 text-success border-success/20",
    Inactive: "bg-surface-tertiary text-muted border-surface-border",
    Pending: "bg-warning/15 text-warning border-warning/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-tiny font-medium border",
        map[status]
      )}
    >
      <Circle
        className={cn(
          "w-1.5 h-1.5 fill-current",
          status === "Active" && "text-success",
          status === "Inactive" && "text-muted",
          status === "Pending" && "text-warning"
        )}
      />
      {status}
    </span>
  );
}

function ActionBadge({ action }: { action: ActionType }) {
  const map: Record<ActionType, string> = {
    CREATE: "bg-success/15 text-success",
    UPDATE: "bg-brand/15 text-brand",
    DELETE: "bg-critical/15 text-critical",
    LOGIN: "bg-sky-500/15 text-sky-400",
    LOGOUT: "bg-surface-tertiary text-muted",
    EXPORT: "bg-amber-500/15 text-amber-400",
    RESET: "bg-purple-500/15 text-purple-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-tiny font-medium font-mono tracking-wide",
        map[action]
      )}
    >
      {action}
    </span>
  );
}

function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  if (status === "Running")
    return (
      <span className="inline-flex items-center gap-1.5 text-success text-small">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Running
      </span>
    );
  if (status === "Degraded")
    return (
      <span className="inline-flex items-center gap-1.5 text-warning text-small">
        <AlertTriangle className="w-3.5 h-3.5" />
        Degraded
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-critical text-small">
      <XCircle className="w-3.5 h-3.5" />
      Stopped
    </span>
  );
}

function PermCheck({ val }: { val: boolean }) {
  return val ? (
    <CheckCircle2 className="w-3.5 h-3.5 text-success mx-auto" />
  ) : (
    <XCircle className="w-3.5 h-3.5 text-surface-tertiary mx-auto" />
  );
}

// ─────────────────────────────────────────────────────────────────
// Modal primitives
// ─────────────────────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={cn(
          "relative z-10 w-full bg-surface-secondary border border-surface-border rounded-xl shadow-2xl",
          width
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h3 className="text-h4 text-primary font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="toolbar-btn w-7 h-7 flex items-center justify-center rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab: Users
// ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<SiemUser[]>(DEMO_USERS);
  const [search, setSearch] = useState("");
  const [loading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<SiemUser | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("Analyst");
  const [inviteSending, setInviteSending] = useState(false);

  // Edit role form state
  const [editRole, setEditRole] = useState<UserRole>("Analyst");

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
  );

  function openEdit(u: SiemUser) {
    setEditUser(u);
    setEditRole(u.role);
    setOpenMenuId(null);
  }

  function saveEdit() {
    if (!editUser) return;
    setUsers((prev) =>
      prev.map((u) => (u.id === editUser.id ? { ...u, role: editRole } : u))
    );
    toast("success", "Role updated", `${editUser.name} is now ${editRole}`);
    setEditUser(null);
  }

  function deactivate(u: SiemUser) {
    setUsers((prev) =>
      prev.map((x) =>
        x.id === u.id
          ? { ...x, status: x.status === "Active" ? "Inactive" : "Active" }
          : x
      )
    );
    const next = u.status === "Active" ? "Inactive" : "Active";
    toast("info", `User ${next === "Inactive" ? "deactivated" : "reactivated"}`, u.email);
    setOpenMenuId(null);
  }

  function resetPassword(u: SiemUser) {
    toast("success", "Reset email sent", `Password reset link sent to ${u.email}`);
    setOpenMenuId(null);
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    setInviteSending(true);
    await new Promise((r) => setTimeout(r, 800));
    setInviteSending(false);
    setInviteOpen(false);
    setInviteEmail("");
    setInviteRole("Analyst");
    toast("success", "Invitation sent", `${inviteEmail} will receive an invite`);
  }

  return (
    <div className="space-y-4">
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className="input-base pl-8 w-full text-small"
          />
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="btn btn-primary btn-sm gap-2"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Invite User
        </button>
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="w-8 h-8" />}
            title="No users found"
            description="Try a different search term"
            size="sm"
          />
        ) : (
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider">
                  User
                </th>
                <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider hidden md:table-cell">
                  Role
                </th>
                <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider hidden lg:table-cell">
                  Last Login
                </th>
                <th className="text-center px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider hidden lg:table-cell">
                  2FA
                </th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  className="hover:bg-surface-tertiary/40 transition-colors"
                >
                  {/* Avatar + Name + Email */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-tiny font-semibold flex-shrink-0",
                          u.color
                        )}
                      >
                        {u.initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-primary font-medium truncate">{u.name}</p>
                        <p className="text-muted text-tiny truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  {/* Role */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    <RoleBadge role={u.role} />
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge status={u.status} />
                  </td>
                  {/* Last Login */}
                  <td className="px-4 py-3 text-muted hidden lg:table-cell">
                    {u.lastLogin
                      ? format(u.lastLogin, "MMM d, yyyy HH:mm")
                      : <span className="text-tiny italic">Never</span>}
                  </td>
                  {/* 2FA */}
                  <td className="px-4 py-3 text-center hidden lg:table-cell">
                    {u.twoFA ? (
                      <ShieldCheck className="w-4 h-4 text-success mx-auto" />
                    ) : (
                      <Lock className="w-4 h-4 text-muted mx-auto opacity-30" />
                    )}
                  </td>
                  {/* Actions menu */}
                  <td className="px-4 py-3 relative">
                    <button
                      onClick={() =>
                        setOpenMenuId((prev) => (prev === u.id ? null : u.id))
                      }
                      className="toolbar-btn w-7 h-7 flex items-center justify-center rounded"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {openMenuId === u.id && (
                      <div className="absolute right-4 top-10 z-20 w-44 bg-surface-elevated border border-surface-border rounded-lg shadow-xl py-1 text-small">
                        <button
                          onClick={() => openEdit(u)}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-secondary hover:bg-surface-tertiary hover:text-primary transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit Role
                        </button>
                        <button
                          onClick={() => deactivate(u)}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-secondary hover:bg-surface-tertiary hover:text-primary transition-colors"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                          {u.status === "Active" ? "Deactivate" : "Reactivate"}
                        </button>
                        <button
                          onClick={() => resetPassword(u)}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-secondary hover:bg-surface-tertiary hover:text-primary transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Reset Password
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Count */}
      <p className="text-tiny text-muted">
        {filtered.length} of {users.length} users
      </p>

      {/* ── Invite Modal ─────────────────────────────────────────── */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite User"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-small text-secondary font-medium">Email address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="analyst@company.com"
              className="input-base w-full"
              onKeyDown={(e) => e.key === "Enter" && sendInvite()}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-small text-secondary font-medium">Assign role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              className="input-base w-full"
            >
              <option value="Admin">Admin</option>
              <option value="SOC Manager">SOC Manager</option>
              <option value="Analyst">Analyst</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={sendInvite}
              disabled={!inviteEmail.trim() || inviteSending}
              className="btn btn-primary btn-sm flex-1 gap-2"
            >
              {inviteSending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              {inviteSending ? "Sending…" : "Send Invitation"}
            </button>
            <button
              onClick={() => setInviteOpen(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Role Modal ───────────────────────────────────────── */}
      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title="Edit User Role"
      >
        {editUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-surface-tertiary rounded-lg">
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-small font-semibold flex-shrink-0",
                  editUser.color
                )}
              >
                {editUser.initials}
              </div>
              <div>
                <p className="text-primary font-medium">{editUser.name}</p>
                <p className="text-muted text-tiny">{editUser.email}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-small text-secondary font-medium">Role</label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
                className="input-base w-full"
              >
                <option value="Admin">Admin</option>
                <option value="SOC Manager">SOC Manager</option>
                <option value="Analyst">Analyst</option>
                <option value="Viewer">Viewer</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={saveEdit} className="btn btn-primary btn-sm flex-1">
                Save Changes
              </button>
              <button
                onClick={() => setEditUser(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab: Roles & Permissions
// ─────────────────────────────────────────────────────────────────

function RolesTab() {
  const [roles, setRoles] = useState<RolePermissions[]>(DEMO_ROLES);
  const [editingRole, setEditingRole] = useState<UserRole | null>(null);
  const [draftPerms, setDraftPerms] = useState<RolePermissions["permissions"] | null>(null);

  function startEdit(role: RolePermissions) {
    setEditingRole(role.role);
    setDraftPerms(structuredClone(role.permissions));
  }

  function cancelEdit() {
    setEditingRole(null);
    setDraftPerms(null);
  }

  function saveEdit() {
    if (!editingRole || !draftPerms) return;
    setRoles((prev) =>
      prev.map((r) =>
        r.role === editingRole ? { ...r, permissions: draftPerms } : r
      )
    );
    toast("success", "Permissions saved", `${editingRole} permissions updated`);
    cancelEdit();
  }

  function togglePerm(
    module: string,
    type: "read" | "write" | "delete",
    val: boolean
  ) {
    if (!draftPerms) return;
    setDraftPerms((prev) => ({
      ...prev!,
      [module]: { ...prev![module], [type]: val },
    }));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {roles.map((r) => {
          const isEditing = editingRole === r.role;
          const perms = isEditing && draftPerms ? draftPerms : r.permissions;

          return (
            <div key={r.role} className="card space-y-4">
              {/* ── Card header ──────────────────────────────────── */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Shield className={cn("w-4 h-4", r.color)} />
                    <h3 className={cn("text-h4 font-semibold", r.color)}>{r.role}</h3>
                    <span className="text-tiny text-muted bg-surface-tertiary px-1.5 py-0.5 rounded-full">
                      {r.userCount} {r.userCount === 1 ? "user" : "users"}
                    </span>
                  </div>
                  <p className="text-tiny text-muted mt-1">{r.description}</p>
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={saveEdit} className="btn btn-primary btn-sm">
                      Save
                    </button>
                    <button onClick={cancelEdit} className="btn btn-secondary btn-sm">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(r)}
                    className="btn btn-secondary btn-sm gap-1.5 flex-shrink-0"
                    disabled={!!editingRole && editingRole !== r.role}
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                )}
              </div>

              {/* ── Permissions grid ─────────────────────────────── */}
              <div className="overflow-x-auto">
                <table className="w-full text-tiny">
                  <thead>
                    <tr className="border-b border-surface-border">
                      <th className="text-left pb-2 text-muted font-medium w-28">Module</th>
                      <th className="text-center pb-2 text-muted font-medium w-12">Read</th>
                      <th className="text-center pb-2 text-muted font-medium w-12">Write</th>
                      <th className="text-center pb-2 text-muted font-medium w-12">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {MODULES.map((mod) => (
                      <tr key={mod} className="hover:bg-surface-tertiary/30 transition-colors">
                        <td className="py-1.5 text-secondary font-medium">{mod}</td>
                        {(["read", "write", "delete"] as const).map((type) =>
                          isEditing ? (
                            <td key={type} className="py-1.5 text-center">
                              <input
                                type="checkbox"
                                checked={perms[mod][type]}
                                onChange={(e) => togglePerm(mod, type, e.target.checked)}
                                className="w-3.5 h-3.5 rounded accent-brand cursor-pointer"
                              />
                            </td>
                          ) : (
                            <td key={type} className="py-1.5">
                              <PermCheck val={perms[mod][type]} />
                            </td>
                          )
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab: Audit Log
// ─────────────────────────────────────────────────────────────────

function AuditTab() {
  const [entries] = useState<AuditEntry[]>(DEMO_AUDIT);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<ActionType | "ALL">("ALL");
  const [userFilter, setUserFilter] = useState("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const uniqueUsers = Array.from(new Set(entries.map((e) => e.user)));

  const filtered = entries.filter((e) => {
    const matchSearch =
      !search ||
      e.user.toLowerCase().includes(search.toLowerCase()) ||
      e.resource.toLowerCase().includes(search.toLowerCase()) ||
      e.details.toLowerCase().includes(search.toLowerCase());
    const matchAction = actionFilter === "ALL" || e.action === actionFilter;
    const matchUser = userFilter === "ALL" || e.user === userFilter;
    return matchSearch && matchAction && matchUser;
  });

  function exportCsv() {
    const header = "Timestamp,User,Email,Action,Resource,Details,IP";
    const rows = filtered.map(
      (e) =>
        `"${format(e.timestamp, "yyyy-MM-dd HH:mm:ss")}","${e.user}","${e.userEmail}","${e.action}","${e.resource}","${e.details}","${e.ip}"`
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hivearmor-audit-${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("success", "Export complete", `${filtered.length} audit entries downloaded`);
  }

  return (
    <div className="space-y-4">
      {/* ── Filters ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit log…"
            className="input-base pl-8 w-full text-small"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as ActionType | "ALL")}
          className="input-base text-small"
        >
          <option value="ALL">All Actions</option>
          {(["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "EXPORT", "RESET"] as ActionType[]).map(
            (a) => (
              <option key={a} value={a}>
                {a}
              </option>
            )
          )}
        </select>

        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="input-base text-small"
        >
          <option value="ALL">All Users</option>
          {uniqueUsers.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        <button
          onClick={exportCsv}
          className="btn btn-secondary btn-sm gap-2 ml-auto"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Clock className="w-8 h-8" />}
            title="No audit entries match"
            description="Adjust your filters to see results"
            size="sm"
          />
        ) : (
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider hidden md:table-cell">
                  User
                </th>
                <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider">
                  Action
                </th>
                <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider hidden lg:table-cell">
                  Resource
                </th>
                <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider hidden xl:table-cell">
                  IP
                </th>
                <th className="w-8 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filtered.map((e) => (
                <>
                  <tr
                    key={e.id}
                    className={cn(
                      "hover:bg-surface-tertiary/40 transition-colors cursor-pointer select-none",
                      expandedId === e.id && "bg-surface-tertiary/30"
                    )}
                    onClick={() =>
                      setExpandedId((prev) => (prev === e.id ? null : e.id))
                    }
                  >
                    <td className="px-4 py-3 text-muted font-mono text-tiny whitespace-nowrap">
                      {format(e.timestamp, "MMM d HH:mm:ss")}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-primary font-medium">{e.user}</span>
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={e.action} />
                    </td>
                    <td className="px-4 py-3 text-secondary hidden lg:table-cell truncate max-w-[200px]">
                      {e.resource}
                    </td>
                    <td className="px-4 py-3 text-muted font-mono text-tiny hidden xl:table-cell">
                      {e.ip}
                    </td>
                    <td className="px-4 py-3">
                      {expandedId === e.id ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted" />
                      )}
                    </td>
                  </tr>
                  {expandedId === e.id && (
                    <tr key={`${e.id}-exp`} className="bg-surface-tertiary/20">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex flex-wrap gap-x-8 gap-y-1 text-tiny">
                          <span>
                            <span className="text-muted">User: </span>
                            <span className="text-secondary">{e.userEmail}</span>
                          </span>
                          <span>
                            <span className="text-muted">Resource: </span>
                            <span className="text-secondary">{e.resource}</span>
                          </span>
                          <span>
                            <span className="text-muted">IP: </span>
                            <span className="font-mono text-secondary">{e.ip}</span>
                          </span>
                          <span className="w-full">
                            <span className="text-muted">Details: </span>
                            <span className="text-primary">{e.details}</span>
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-tiny text-muted">
        {filtered.length} of {entries.length} entries
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Plugin Health
// ─────────────────────────────────────────────────────────────────

interface PluginStatus {
  name: string;
  state: "RUNNING" | "STOPPED" | "FATAL" | "STARTING" | string;
  uptime?: string;
}

interface PluginHealthResponse {
  reachable: boolean;
  plugins: PluginStatus[];
  lastChecked: string;
}

function PluginHealthCard() {
  const [health, setHealth] = useState<PluginHealthResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api.get<PluginHealthResponse>("/api/plugin-health");
        if (!cancelled) { setHealth(data); setError(false); }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  function stateColor(state: string) {
    if (state === "RUNNING") return "text-success";
    if (state === "FATAL") return "text-critical";
    return "text-warning";
  }

  function stateDot(state: string) {
    if (state === "RUNNING") return "bg-success";
    if (state === "FATAL") return "bg-critical";
    return "bg-warning";
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-brand" />
          <h3 className="text-h4 text-primary font-semibold">Event Processor Plugins</h3>
        </div>
        {health && (
          <span className="text-tiny text-muted">
            Last checked {new Date(health.lastChecked).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 flex items-center gap-2 text-critical text-small">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Could not load plugin health — check backend connectivity.
        </div>
      )}

      {!error && !health && (
        <div className="px-4 py-4 text-small text-muted animate-pulse">Loading…</div>
      )}

      {!error && health && !health.reachable && (
        <div className="px-4 py-3 flex items-center gap-2 text-warning text-small">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Event processor unreachable — plugins status unavailable.
        </div>
      )}

      {!error && health && health.reachable && (
        <table className="w-full text-small">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider">Plugin</th>
              <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider">State</th>
              <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider hidden md:table-cell">Uptime</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {health.plugins.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-muted text-tiny italic">No plugins reported.</td>
              </tr>
            )}
            {health.plugins.map((p) => (
              <tr key={p.name} className="hover:bg-surface-tertiary/40 transition-colors">
                <td className="px-4 py-3 font-mono text-secondary">{p.name}</td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center gap-1.5 font-medium", stateColor(p.state))}>
                    <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", stateDot(p.state))} />
                    {p.state}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted hidden md:table-cell">{p.uptime ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tab: System Health
// ─────────────────────────────────────────────────────────────────

interface Thresholds {
  cpuWarn: number;
  cpuCrit: number;
  memWarn: number;
  memCrit: number;
  diskWarn: number;
  diskCrit: number;
  queueWarn: number;
  queueCrit: number;
}

function HealthTab() {
  const [services] = useState<ServiceRow[]>(buildDemoServices);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [thresholds, setThresholds] = useState<Thresholds>({
    cpuWarn: 70,
    cpuCrit: 90,
    memWarn: 75,
    memCrit: 90,
    diskWarn: 80,
    diskCrit: 95,
    queueWarn: 50000,
    queueCrit: 200000,
  });
  const [draftThresholds, setDraftThresholds] = useState<Thresholds>(thresholds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Demo KPI values (slightly randomized on each refresh)
  const [kpiSeed, setKpiSeed] = useState(0);

  const cpu = 41 + (kpiSeed % 5);
  const mem = 62 + (kpiSeed % 8);
  const disk = 54;
  const queue = 12480 + kpiSeed * 100;
  const osHealth = services.find((s) => s.name === "opensearch")?.status ?? "Running";

  function kpiStatus(val: number, warn: number, crit: number): "ok" | "warn" | "critical" {
    if (val >= crit) return "critical";
    if (val >= warn) return "warn";
    return "ok";
  }

  const kpis: HealthKpi[] = [
    {
      label: "CPU Usage",
      value: cpu,
      unit: "%",
      status: kpiStatus(cpu, thresholds.cpuWarn, thresholds.cpuCrit),
      icon: <Cpu className="w-5 h-5" />,
    },
    {
      label: "Memory",
      value: mem,
      unit: "%",
      status: kpiStatus(mem, thresholds.memWarn, thresholds.memCrit),
      icon: <MemoryStick className="w-5 h-5" />,
    },
    {
      label: "Disk",
      value: disk,
      unit: "%",
      status: kpiStatus(disk, thresholds.diskWarn, thresholds.diskCrit),
      icon: <HardDrive className="w-5 h-5" />,
    },
    {
      label: "Event Queue",
      value: queue.toLocaleString(),
      status: kpiStatus(queue, thresholds.queueWarn, thresholds.queueCrit),
      icon: <Layers className="w-5 h-5" />,
    },
    {
      label: "OpenSearch",
      value: osHealth,
      status:
        osHealth === "Running" ? "ok" : osHealth === "Degraded" ? "warn" : "critical",
      icon: <Database className="w-5 h-5" />,
    },
  ];

  async function refresh(silent = false) {
    if (!silent) setRefreshing(true);
    await new Promise((r) => setTimeout(r, 400));
    setKpiSeed((s) => s + 1);
    setLastRefresh(new Date());
    setRefreshing(false);
  }

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => refresh(true), 30_000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh]);

  function kpiColorClass(status: HealthKpi["status"]) {
    if (status === "critical") return "text-critical";
    if (status === "warn") return "text-warning";
    return "text-success";
  }

  function kpiBgClass(status: HealthKpi["status"]) {
    if (status === "critical") return "border-critical/30 bg-critical/5";
    if (status === "warn") return "border-warning/30 bg-warning/5";
    return "border-success/30 bg-success/5";
  }

  function saveThresholds() {
    setThresholds(draftThresholds);
    setThresholdOpen(false);
    toast("success", "Thresholds saved", "Alert thresholds updated successfully");
  }

  return (
    <div className="space-y-4">
      {/* ── Top toolbar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => refresh()}
            disabled={refreshing}
            className="btn btn-secondary btn-sm gap-2"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            Refresh
          </button>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setAutoRefresh((v) => !v)}
              className={cn(
                "w-9 h-5 rounded-full transition-colors relative",
                autoRefresh ? "bg-brand" : "bg-surface-tertiary"
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                  autoRefresh ? "left-4" : "left-0.5"
                )}
              />
            </div>
            <span className="text-small text-secondary">Auto-refresh (30s)</span>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-tiny text-muted">
            Last updated {format(lastRefresh, "HH:mm:ss")}
          </span>
          <button
            onClick={() => {
              setDraftThresholds(thresholds);
              setThresholdOpen(true);
            }}
            className="btn btn-secondary btn-sm gap-1.5"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Thresholds
          </button>
        </div>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={cn(
              "card border flex flex-col items-center gap-2 py-5",
              kpiBgClass(k.status)
            )}
          >
            <div className={cn("opacity-70", kpiColorClass(k.status))}>{k.icon}</div>
            <div className="text-center">
              <p
                className={cn(
                  "text-h3 font-bold tabular-nums leading-tight",
                  kpiColorClass(k.status)
                )}
              >
                {k.value}
                {k.unit && (
                  <span className="text-small font-normal ml-0.5">{k.unit}</span>
                )}
              </p>
              <p className="text-tiny text-muted mt-1">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Services table ───────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
          <h3 className="text-h4 text-primary font-semibold">Services</h3>
          <span className="text-tiny text-muted">
            {services.filter((s) => s.status === "Running").length} / {services.length} running
          </span>
        </div>
        <table className="w-full text-small">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider">
                Service
              </th>
              <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider hidden md:table-cell">
                PID
              </th>
              <th className="text-left px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider hidden lg:table-cell">
                Uptime
              </th>
              <th className="text-right px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider hidden lg:table-cell">
                Memory
              </th>
              <th className="text-right px-4 py-2.5 text-muted font-medium text-tiny uppercase tracking-wider">
                CPU%
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {services.map((svc) => (
              <tr
                key={svc.name}
                className={cn(
                  "hover:bg-surface-tertiary/40 transition-colors",
                  svc.status === "Stopped" && "opacity-60"
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    {svc.icon}
                    <div>
                      <p className="text-primary font-medium">{svc.displayName}</p>
                      <p className="text-muted text-tiny font-mono">{svc.name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ServiceStatusBadge status={svc.status} />
                </td>
                <td className="px-4 py-3 text-muted font-mono hidden md:table-cell">
                  {svc.pid ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted hidden lg:table-cell">{svc.uptime}</td>
                <td className="px-4 py-3 text-right text-muted hidden lg:table-cell">
                  {svc.memoryMb > 0 ? `${svc.memoryMb} MB` : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={cn(
                      "font-mono tabular-nums",
                      svc.cpuPct >= 20
                        ? "text-critical"
                        : svc.cpuPct >= 10
                        ? "text-warning"
                        : "text-secondary"
                    )}
                  >
                    {svc.cpuPct > 0 ? `${svc.cpuPct.toFixed(1)}%` : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Plugin Health ────────────────────────────────────────── */}
      <PluginHealthCard />

      {/* ── Alert Thresholds Modal ────────────────────────────────── */}
      <Modal
        open={thresholdOpen}
        onClose={() => setThresholdOpen(false)}
        title="Alert Thresholds"
        width="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-small text-muted">
            Configure warning and critical thresholds for system health metrics.
          </p>
          <div className="space-y-3">
            {(
              [
                {
                  label: "CPU Usage (%)",
                  warnKey: "cpuWarn",
                  critKey: "cpuCrit",
                },
                {
                  label: "Memory Usage (%)",
                  warnKey: "memWarn",
                  critKey: "memCrit",
                },
                {
                  label: "Disk Usage (%)",
                  warnKey: "diskWarn",
                  critKey: "diskCrit",
                },
                {
                  label: "Event Queue (events)",
                  warnKey: "queueWarn",
                  critKey: "queueCrit",
                },
              ] as { label: string; warnKey: keyof Thresholds; critKey: keyof Thresholds }[]
            ).map((row) => (
              <div key={row.label} className="space-y-1">
                <p className="text-small text-secondary font-medium">{row.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-tiny text-muted mb-1 block">Warning</label>
                    <input
                      type="number"
                      value={draftThresholds[row.warnKey]}
                      onChange={(e) =>
                        setDraftThresholds((prev) => ({
                          ...prev,
                          [row.warnKey]: Number(e.target.value),
                        }))
                      }
                      className="input-base w-full text-small"
                    />
                  </div>
                  <div>
                    <label className="text-tiny text-muted mb-1 block">Critical</label>
                    <input
                      type="number"
                      value={draftThresholds[row.critKey]}
                      onChange={(e) =>
                        setDraftThresholds((prev) => ({
                          ...prev,
                          [row.critKey]: Number(e.target.value),
                        }))
                      }
                      className="input-base w-full text-small"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={saveThresholds} className="btn btn-primary btn-sm flex-1">
              Save Thresholds
            </button>
            <button
              onClick={() => setThresholdOpen(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
  { id: "roles", label: "Roles & Permissions", icon: <Shield className="w-4 h-4" /> },
  { id: "audit", label: "Audit Log", icon: <Clock className="w-4 h-4" /> },
  { id: "health", label: "System Health", icon: <Activity className="w-4 h-4" /> },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("users");

  return (
    <div className="space-y-4">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-h2 text-primary font-semibold">Administration</h1>
        <p className="text-tiny text-muted mt-0.5">
          User management, permissions, audit trail, and system health
        </p>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-surface-border overflow-x-auto pb-0 scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 text-small font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
              activeTab === t.id
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-secondary hover:border-surface-border"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────── */}
      <div>
        {activeTab === "users" && <UsersTab />}
        {activeTab === "roles" && <RolesTab />}
        {activeTab === "audit" && <AuditTab />}
        {activeTab === "health" && <HealthTab />}
      </div>
    </div>
  );
}
