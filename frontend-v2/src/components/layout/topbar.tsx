"use client";

import { cn } from "@/lib/utils";
import { Search, Bell, Sun, Moon, User, LogOut, Command, Settings, ChevronDown, X, CheckCheck, ExternalLink, UserCog } from "lucide-react";
import { useThemeStore } from "@/store/theme";
import { useAuthStore } from "@/store/auth";
import { useSidebarStore } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { notificationService, type InAppNotification } from "@/services/notification.service";
import { StreamStatusDot } from "./stream-status-dot";

const typeColors: Record<string, string> = {
  ERROR:   "var(--color-critical)",
  WARNING: "var(--color-degraded)",
  INFO:    "var(--brand-primary)",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function TopBar() {
  const { theme, toggleTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { collapsed } = useSidebarStore();
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await notificationService.getUnreadCount();
      setUnreadCount(typeof count === "number" ? count : 0);
    } catch {
      // silent — keep previous count
    }
  }, []);

  const fetchFeed = useCallback(async () => {
    setLoadingNotifs(true);
    try {
      const page = await notificationService.getFeed(0, 15);
      const items = Array.isArray(page) ? page : (page?.content ?? []);
      setNotifications(items);
      const unread = items.filter((n) => !n.read).length;
      setUnreadCount(unread);
    } catch {
      // keep empty
    } finally {
      setLoadingNotifs(false);
    }
  }, []);

  // Poll unread count every 30s
  useEffect(() => {
    fetchUnreadCount();
    pollRef.current = setInterval(fetchUnreadCount, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchUnreadCount]);

  // Load feed when dropdown opens
  useEffect(() => {
    if (notifOpen) fetchFeed();
  }, [notifOpen, fetchFeed]);

  // Global ⌘K / Ctrl+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // optimistic update already applied
    }
  };

  const handleMarkRead = async (n: InAppNotification) => {
    if (n.read) return;
    try {
      await notificationService.markRead(n.id);
      setNotifications((ns) => ns.map((x) => x.id === n.id ? { ...x, read: true } : x));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const handleDismiss = async (n: InAppNotification) => {
    try {
      await notificationService.updateStatus(n.id, "HIDDEN");
      setNotifications((ns) => ns.filter((x) => x.id !== n.id));
      if (!n.read) setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  return (
    <>
      <header
        className={cn(
          "fixed top-8 right-0 z-topbar h-12",
          "backdrop-blur-md",
          "flex items-center justify-between px-4",
          "transition-all duration-200 ease-smooth",
        )}
        style={{
          left: collapsed ? "64px" : "260px",
          background: "rgba(10, 14, 28, 0.92)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* Search trigger */}
        <button
          onClick={() => setCmdOpen(true)}
          className="topbar-search min-w-[220px] max-w-[340px]"
        >
          <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
          <span className="text-tiny flex-1 text-left" style={{ color: "var(--text-muted)" }}>
            Search HiveArmor...
          </span>
          <span
            className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded font-mono text-micro"
            style={{
              background: "var(--surface-tertiary)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-muted)",
            }}
          >
            <Command className="w-2.5 h-2.5" />K
          </span>
        </button>

        {/* Right controls */}
        <div className="flex items-center gap-1">
          {/* Stream connection status */}
          <StreamStatusDot />

          <div className="w-px h-5 bg-surface-border mx-1" />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted hover:text-primary hover:bg-surface-tertiary transition-colors"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications bell */}
          <div className="relative">
            <button
              onClick={() => { setNotifOpen(!notifOpen); setUserMenuOpen(false); }}
              className="relative p-2 rounded-lg text-muted hover:text-primary hover:bg-surface-tertiary transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--color-critical)] text-white text-micro flex items-center justify-center font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <>
                <div className="fixed inset-0 z-dropdown" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-[340px] z-dropdown bg-surface-primary shadow-dropdown rounded-xl border border-surface-border overflow-hidden animate-slide-in-down">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
                    <div className="flex items-center gap-2">
                      <span className="text-small font-semibold text-primary">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="text-micro px-1.5 py-0.5 rounded-full bg-critical/15 text-critical font-medium">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllRead} className="text-tiny text-brand hover:text-brand-hover flex items-center gap-1">
                          <CheckCheck className="w-3 h-3" /> All read
                        </button>
                      )}
                      <button onClick={() => setNotifOpen(false)} className="text-muted hover:text-primary">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Feed */}
                  <div className="max-h-[360px] overflow-y-auto">
                    {loadingNotifs ? (
                      <div className="py-8 text-center text-tiny text-muted">Loading…</div>
                    ) : notifications.length === 0 ? (
                      <div className="py-8 text-center text-tiny text-muted">No notifications</div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleMarkRead(n)}
                          className={cn(
                            "flex gap-3 px-4 py-3 border-b border-surface-border/50 hover:bg-surface-tertiary/50 transition-colors cursor-pointer group",
                            !n.read && "bg-surface-secondary/40",
                          )}
                        >
                          <div
                            className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                            style={{ background: typeColors[n.type] || "var(--text-muted)" }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-tiny font-medium text-primary truncate">{n.source}</span>
                              <span className="text-micro text-muted shrink-0">{timeAgo(n.createdAt)}</span>
                            </div>
                            <p className="text-tiny text-muted line-clamp-2">{n.message}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDismiss(n); }}
                            className="opacity-0 group-hover:opacity-100 text-muted hover:text-primary transition-opacity shrink-0 mt-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-2.5 border-t border-surface-border bg-surface-secondary/30">
                    <Link
                      href="/admin/notifications"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center justify-center gap-1.5 text-tiny text-brand hover:text-brand-hover transition-colors"
                    >
                      View all notifications <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-surface-border mx-1" />

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => { setUserMenuOpen(!userMenuOpen); setNotifOpen(false); }}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-md hover:bg-surface-tertiary transition-colors"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 text-small font-semibold"
                style={{ background: "linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))" }}
              >
                {user?.login?.[0]?.toUpperCase() || <User className="w-3.5 h-3.5" />}
              </div>
              <span className="text-tiny text-secondary hidden md:inline max-w-[100px] truncate">
                {user?.login || "User"}
              </span>
              <ChevronDown className="w-3 h-3 text-muted hidden md:block" />
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-dropdown" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 z-dropdown bg-surface-primary shadow-dropdown rounded-xl border border-surface-border overflow-hidden animate-slide-in-down">
                  <div className="px-4 py-3 border-b border-surface-border">
                    <p className="text-small font-semibold text-primary">{user?.login}</p>
                    <p className="text-tiny text-muted truncate">{user?.email || "SOC Analyst"}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {user?.authorities?.slice(0, 2).map((r) => (
                        <span key={r} className="text-micro px-1.5 py-0.5 rounded bg-brand-subtle text-brand">
                          {r.replace("ROLE_", "")}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { setUserMenuOpen(false); router.push("/settings"); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-tiny text-secondary hover:bg-surface-tertiary transition-colors"
                    >
                      <UserCog className="w-3.5 h-3.5" />
                      My Account
                    </button>
                    <button
                      onClick={() => { setUserMenuOpen(false); router.push("/admin/settings"); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-tiny text-secondary hover:bg-surface-tertiary transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      System Settings
                    </button>
                    <div className="my-1 mx-3 border-t border-surface-border/50" />
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-tiny text-secondary hover:bg-surface-tertiary hover:text-critical transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
