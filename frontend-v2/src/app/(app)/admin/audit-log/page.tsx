"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { auditService, type AuditEvent } from "@/services/audit.service";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { useIsAdmin } from "@/hooks/use-current-user";
import { redirect } from "next/navigation";

const PAGE_SIZE = 50;

// Known event types grouped for the filter dropdown
const EVENT_TYPE_OPTIONS = [
  "AUTH_ATTEMPT", "AUTH_SUCCESS", "AUTH_FAILURE", "AUTH_LOGOUT",
  "TFA_CODE_SENT", "TFA_VERIFIED",
  "ALERT_STATUS_UPDATE_ATTEMPT", "ALERT_STATUS_UPDATE_SUCCESS",
  "INCIDENT_CREATION_ATTEMPT", "INCIDENT_CREATION_SUCCESS",
  "INCIDENT_UPDATE_ATTEMPT", "INCIDENT_UPDATE_SUCCESS",
  "AGENT_COMMAND_EXECUTED",
  "API_KEY_CREATE_ATTEMPT", "API_KEY_CREATE_SUCCESS",
  "API_KEY_DELETE_ATTEMPT", "API_KEY_DELETE_SUCCESS",
  "USER_CREATION_ATTEMPT", "USER_CREATION_SUCCESS",
  "USER_DELETE_ATTEMPT", "USER_DELETE_SUCCESS",
  "CONFIG_CHANGED",
  "ERROR",
];

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString([], {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return ts; }
}

function eventTypeBadgeColor(type: string): string {
  if (type.includes("ERROR"))    return "bg-critical/10 text-critical";
  if (type.includes("FAILURE"))  return "bg-critical/10 text-critical";
  if (type.includes("SUCCESS"))  return "bg-success/10 text-success";
  if (type.includes("LOGOUT"))   return "bg-warning/10 text-warning";
  if (type === "AGENT_COMMAND_EXECUTED") return "bg-purple-500/10 text-purple-400";
  if (type.includes("ATTEMPT"))  return "bg-brand/10 text-brand";
  return "bg-surface-tertiary text-secondary";
}

export default function AuditLogPage() {
  const isAdmin = useIsAdmin();

  const [events, setEvents]   = useState<AuditEvent[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(0);
  const [loading, setLoading] = useState(true);

  const [eventType, setEventType] = useState("");
  const [actor, setActor]         = useState("");
  const [fromDate, setFromDate]   = useState("");
  const [toDate, setToDate]       = useState("");

  // Guard: non-admin should not see this page
  useEffect(() => {
    if (isAdmin === false) redirect("/403");
  }, [isAdmin]);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const { data, total: t } = await auditService.getEvents({
        eventType: eventType || undefined,
        actor:     actor || undefined,
        from:      fromDate || undefined,
        to:        toDate || undefined,
        page:      p,
        size:      PAGE_SIZE,
      });
      setEvents(data);
      setTotal(t);
      setPage(p);
    } catch (err) {
      console.error("Failed to load audit events:", err);
    } finally {
      setLoading(false);
    }
  }, [eventType, actor, fromDate, toDate]);

  useEffect(() => { load(0); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-h1">Audit Log</h1>
          <p className="text-secondary text-small mt-0.5">
            Platform-wide security and activity trail — read only
          </p>
        </div>
        <button
          onClick={() => load(page)}
          className="btn-secondary flex items-center gap-2"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        {/* Event type */}
        <div className="flex flex-col gap-1 min-w-[200px]">
          <label className="text-tiny text-muted uppercase tracking-wider font-medium">Event Type</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="input-base"
          >
            <option value="">All event types</option>
            {EVENT_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Actor / username */}
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-tiny text-muted uppercase tracking-wider font-medium">Username</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
            <input
              type="text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="Search by username…"
              className="input-base w-full pl-9"
            />
          </div>
        </div>

        {/* Date range */}
        <div className="flex flex-col gap-1">
          <label className="text-tiny text-muted uppercase tracking-wider font-medium">From</label>
          <input
            type="datetime-local"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value ? new Date(e.target.value).toISOString() : "")}
            className="input-base"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-tiny text-muted uppercase tracking-wider font-medium">To</label>
          <input
            type="datetime-local"
            value={toDate}
            onChange={(e) => setToDate(e.target.value ? new Date(e.target.value).toISOString() : "")}
            className="input-base"
          />
        </div>

        <button
          onClick={() => { setEventType(""); setActor(""); setFromDate(""); setToDate(""); }}
          className="btn-secondary self-end"
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={4} />
        ) : events.length === 0 ? (
          <div className="min-h-[40vh] flex items-center justify-center">
            <EmptyState
              icon={<Shield className="w-6 h-6" />}
              title="No audit events found"
              description={
                eventType || actor || fromDate || toDate
                  ? "No events match the current filters"
                  : "No audit events have been recorded yet"
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-secondary text-muted uppercase tracking-wide text-[10px]">
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Timestamp</th>
                    <th className="px-4 py-3 text-left font-medium">Event Type</th>
                    <th className="px-4 py-3 text-left font-medium">Message</th>
                    <th className="px-4 py-3 text-left font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {events.map((ev, i) => (
                    <tr key={i} className="hover:bg-surface-secondary transition-colors">
                      <td className="px-4 py-3 text-tiny font-mono text-muted whitespace-nowrap">
                        {formatTs(ev["@timestamp"])}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap",
                          eventTypeBadgeColor(ev.type),
                        )}>
                          {ev.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-small text-primary max-w-[480px] truncate" title={ev.message}>
                        {ev.message}
                      </td>
                      <td className="px-4 py-3 text-tiny text-muted">
                        {ev.source ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
              <p className="text-tiny text-muted">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()} events
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => load(page - 1)}
                  disabled={page === 0}
                  className="btn btn-xs btn-secondary disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => load(page + 1)}
                  disabled={page >= totalPages - 1}
                  className="btn btn-xs btn-secondary disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
