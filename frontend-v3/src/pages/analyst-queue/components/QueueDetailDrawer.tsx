/**
 * QueueDetailDrawer — S17 full implementation per CMD-07
 * Alert detail drawer (420px) with status updates, timeline, and actions
 */

import { useEffect, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Copy, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { QUEUE_TRIAGE_DENIED } from '../analystQueue.capabilities';

import type { AlertDetailDTO, AlertSideDTO, RelatedAlertDTO } from '@/components/alert-context-drawer/alertContextDrawer.types';
import { ALERT_STATUS } from '@/constants/status.constants';
import type { AlertStatus } from '@/constants/status.constants';
import { apiClient } from '@/lib/apiClient';

export interface QueueDetailDrawerProps {
  alertId: string | null;
  onClose: () => void;
  onOpenAlert?: (alertId: string) => void;
  canTriage?: boolean;
  onEscalate?: (alertId: string) => void;
}

// Fetch alert detail
async function fetchAlertDetail(alertId: string): Promise<AlertDetailDTO> {
  return apiClient.get<AlertDetailDTO>(`/ha-alerts/${alertId}`);
}

// Fetch related alerts — GET /api/ha-alerts/{alertId}/related (HaAlertInvestigationResource)
async function fetchRelatedAlerts(alertId: string): Promise<RelatedAlertDTO[]> {
  return apiClient.get<RelatedAlertDTO[]>(`/ha-alerts/${alertId}/related`);
}

// Update alert status
async function updateAlertStatus(alertId: string, status: AlertStatus): Promise<void> {
  const statusCode: Record<AlertStatus, number> = {
    open: 2,
    in_progress: 3,
    resolved: 5,
    false_positive: 7,
    suppressed: 5,
  };
  return apiClient.post<void>('/ha-alerts/status', {
    alertIds: [alertId],
    status: statusCode[status],
    statusObservation: '',
    addFalsePositiveTag: status === ALERT_STATUS.FALSE_POSITIVE,
  });
}

// Helper: Map numeric severity to label and color
function getSeverityDisplay(severity: number): { label: string; color: string; bgColor: string } {
  if (severity >= 9) return { label: 'CRITICAL', color: 'var(--ha-critical)', bgColor: 'var(--ha-fill-critical-muted)' };
  if (severity >= 7) return { label: 'HIGH', color: 'var(--ha-high)', bgColor: 'var(--ha-fill-high-muted)' };
  if (severity >= 4) return { label: 'MEDIUM', color: 'var(--ha-medium)', bgColor: 'var(--ha-fill-medium-muted)' };
  return { label: 'LOW', color: 'var(--ha-text-secondary)', bgColor: 'transparent' };
}

// Entity Observable Card (adversary/target panels)
function EntityObservableCard({ title, data }: { title: string; data: AlertSideDTO | null }): JSX.Element {
  if (!data || (!data.ip && !data.hostname && !data.processName && !data.username && data.networkIds.length === 0)) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </div>
        <div style={{ padding: 12, background: 'var(--ha-surface-raised)', borderRadius: 'var(--ha-radius-base)', fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>
          No {title.toLowerCase()} data available.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title}
      </div>
      <dl style={{ margin: 0, padding: 8, background: 'var(--ha-surface-raised)', borderRadius: 'var(--ha-radius-base)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.ip && (
          <>
            <dt style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', fontWeight: 600 }}>IP Address</dt>
            <dd style={{ margin: 0, fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', fontFamily: 'var(--ha-font-mono)' }}>{data.ip}</dd>
          </>
        )}
        {data.hostname && (
          <>
            <dt style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', fontWeight: 600 }}>Hostname</dt>
            <dd style={{ margin: 0, fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', fontFamily: 'var(--ha-font-mono)' }}>{data.hostname}</dd>
          </>
        )}
        {data.processName && (
          <>
            <dt style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', fontWeight: 600 }}>Process</dt>
            <dd style={{ margin: 0, fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', fontFamily: 'var(--ha-font-mono)' }}>{data.processName}</dd>
          </>
        )}
        {data.username && (
          <>
            <dt style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', fontWeight: 600 }}>Username</dt>
            <dd style={{ margin: 0, fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', fontFamily: 'var(--ha-font-mono)' }}>{data.username}</dd>
          </>
        )}
        {data.networkIds.length > 0 && (
          <>
            <dt style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', fontWeight: 600 }}>Network IDs</dt>
            <dd style={{ margin: 0, fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', fontFamily: 'var(--ha-font-mono)' }}>{data.networkIds.join(', ')}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

// Observables section (raw fields with copy-to-clipboard for hashes)
function ObservablesSection({ rawFields }: { rawFields: Record<string, string> }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const entries = Object.entries(rawFields);
  const visibleCount = expanded ? entries.length : Math.min(8, entries.length);
  const visibleEntries = entries.slice(0, visibleCount);

  const copyToClipboard = (value: string, field: string): void => {
    void navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const isHashField = (key: string): boolean => {
    const lower = key.toLowerCase();
    return lower.includes('md5') || lower.includes('sha1') || lower.includes('sha256') || lower.includes('hash');
  };

  if (entries.length === 0) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Observables
        </div>
        <div style={{ padding: 12, background: 'var(--ha-surface-raised)', borderRadius: 'var(--ha-radius-base)', fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>
          No observable fields available.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Observables
      </div>
      <dl style={{ margin: 0, padding: 8, background: 'var(--ha-surface-raised)', borderRadius: 'var(--ha-radius-base)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibleEntries.map(([key, value]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <dt style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', fontWeight: 600, marginBottom: 4 }}>{key}</dt>
              <dd style={{ margin: 0, fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', fontFamily: 'var(--ha-font-mono)', overflowWrap: 'break-word' }}>{value}</dd>
            </div>
            {isHashField(key) && (
              <button
                onClick={() => copyToClipboard(value, key)}
                aria-label={`Copy ${key} to clipboard`}
                title="Copy to clipboard"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ha-text-secondary)', display: 'flex', alignItems: 'center' }}
              >
                <Copy size={14} />
                {copiedField === key && <span style={{ marginLeft: 4, fontSize: 'var(--ha-text-xs)', color: 'var(--ha-positive)' }}>Copied!</span>}
              </button>
            )}
          </div>
        ))}
      </dl>
      {entries.length > 8 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ marginTop: 8, background: 'transparent', border: 'none', color: 'var(--ha-primary)', fontSize: 'var(--ha-text-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          {expanded ? 'Show less' : `Show all ${entries.length} fields`}
          {expanded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      )}
    </div>
  );
}

// Related Alerts section
function RelatedAlertsSection({ alertId, onSelectAlert }: { alertId: string; onSelectAlert: (id: string) => void }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const { data: relatedAlerts, isLoading, isError } = useQuery({
    queryKey: ['alert-related', alertId],
    queryFn: () => fetchRelatedAlerts(alertId),
    enabled: expanded,
  });

  const count = relatedAlerts?.length ?? 0;

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Related Alerts {isLoading ? '(loading…)' : `(${count})`}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: 8, background: 'var(--ha-surface-raised)', borderRadius: 'var(--ha-radius-base)' }}>
          {isLoading && <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>Loading related alerts...</div>}
          {isError && <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>Related alerts unavailable.</div>}
          {relatedAlerts && relatedAlerts.length === 0 && <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>No related alerts found.</div>}
          {relatedAlerts && relatedAlerts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {relatedAlerts.slice(0, 10).map((related) => {
                const sev = getSeverityDisplay(related.severity);
                return (
                  <button
                    key={related.id}
                    onClick={() => onSelectAlert(related.id)}
                    style={{ textAlign: 'left', background: 'var(--ha-background)', border: '1px solid var(--ha-border)', borderRadius: 'var(--ha-radius-sm)', padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 8 }}
                  >
                    <span style={{ padding: '2px 6px', background: sev.bgColor, color: sev.color, fontSize: 'var(--ha-text-xs)', fontWeight: 600, borderRadius: 'var(--ha-radius-sm)', flexShrink: 0 }}>
                      {sev.label}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{related.title}</div>
                      <div style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)', fontFamily: 'var(--ha-font-mono)' }}>{new Date(related.timestamp).toLocaleString()}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QueueDetailDrawer({
  alertId,
  onClose,
  onOpenAlert,
  canTriage = false,
  onEscalate,
}: QueueDetailDrawerProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const canUpdateStatus = canTriage;

  const { data: alert, isLoading, isError, error } = useQuery({
    queryKey: ['alert', alertId],
    queryFn: () => {
      if (!alertId) throw new Error('Alert ID is required');
      return fetchAlertDetail(alertId);
    },
    enabled: Boolean(alertId),
    staleTime: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AlertStatus }) => updateAlertStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alert', alertId] });
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const handleStatusChange = (newStatus: AlertStatus): void => {
    if (!alertId || !canUpdateStatus) return;
    statusMutation.mutate({ id: alertId, status: newStatus });
  };

  const handleSelectRelatedAlert = (id: string): void => {
    onOpenAlert?.(id);
  };

  // Close drawer on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    if (alertId) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
    return undefined;
  }, [alertId, onClose]);

  if (!alertId) return null;

  const sev = alert ? getSeverityDisplay(alert.severity) : { label: 'LOADING', color: 'var(--ha-text-secondary)', bgColor: 'transparent' };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="queue-drawer-title"
      style={{
        position: 'fixed',
        top: '56px', // below masthead
        right: 0,
        bottom: 0,
        width: '420px',
        background: 'var(--ha-surface-primary)',
        borderLeft: '1px solid var(--ha-border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 200,
        boxShadow: 'var(--ha-shadow-drawer)',
      }}
    >
      {/* Header — Fixed */}
      <div
        style={{
          height: 56,
          padding: '0 16px',
          borderBottom: '1px solid var(--ha-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ padding: '4px 8px', background: sev.bgColor, color: sev.color, fontSize: 'var(--ha-text-xs)', fontWeight: 600, borderRadius: 'var(--ha-radius-sm)', flexShrink: 0 }}>
            {sev.label}
          </span>
          <h2
            id="queue-drawer-title"
            title={alert?.title}
            style={{
              fontSize: 'var(--ha-text-md)',
              color: 'var(--ha-text-primary)',
              margin: 0,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {isLoading ? 'Loading...' : alert?.title ?? 'Alert Detail'}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close alert drawer"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 8,
            display: 'flex',
            alignItems: 'center',
            color: 'var(--ha-text-secondary)',
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Body — Scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ height: 16, background: 'var(--ha-surface-raised)', borderRadius: 'var(--ha-radius-sm)' }} />
            <div style={{ height: 16, background: 'var(--ha-surface-raised)', borderRadius: 'var(--ha-radius-sm)', width: '60%' }} />
            <div style={{ height: 80, background: 'var(--ha-surface-raised)', borderRadius: 'var(--ha-radius-base)' }} />
          </div>
        )}

        {isError && (
          <div style={{ padding: 12, background: 'var(--ha-fill-critical-subtle)', border: '1px solid var(--ha-critical)', borderRadius: 'var(--ha-radius-base)', fontSize: 'var(--ha-text-sm)', color: 'var(--ha-critical)' }}>
            {(error as Error)?.message.includes('404') ? 'Alert not found. It may have been deleted.' : 'Unable to load alert details.'}
            {!(error as Error)?.message.includes('404') && (
              <button
                onClick={() => void queryClient.invalidateQueries({ queryKey: ['alert', alertId] })}
                style={{ marginLeft: 8, background: 'transparent', border: 'none', color: 'var(--ha-critical)', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {alert && (
          <>
            {/* Section 1 — Detection Details */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Detection Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>Timestamp: </span>
                  <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)', fontFamily: 'var(--ha-font-mono)' }}>{alert.timestamp}</span>
                </div>
                <div>
                  <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>Category: </span>
                  <span style={{ padding: '2px 8px', background: 'var(--ha-surface-raised)', fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', borderRadius: 'var(--ha-radius-sm)' }}>{alert.category}</span>
                </div>
                {alert.ruleName && (
                  <div>
                    <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>Detection Rule: </span>
                    {alert.ruleId ? (
                      <a href={`/detection-rules/${alert.ruleId}`} style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-primary)', textDecoration: 'none' }}>{alert.ruleName}</a>
                    ) : (
                      <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-primary)' }}>{alert.ruleName}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Section 2 — Adversary */}
            <EntityObservableCard title="Adversary" data={alert.adversary} />

            {/* Section 3 — Target */}
            <EntityObservableCard title="Target" data={alert.target} />

            {/* Section 4 — Observables */}
            <ObservablesSection rawFields={alert.rawFields} />

            {/* Section 5 — Status Update */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Update Status</div>
              {canUpdateStatus ? (
                <select
                  value={alert.status}
                  onChange={(e) => handleStatusChange(e.target.value as AlertStatus)}
                  disabled={statusMutation.isPending}
                  aria-label="Update alert status"
                  aria-busy={statusMutation.isPending}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--ha-surface-raised)',
                    border: '1px solid var(--ha-border)',
                    borderRadius: 'var(--ha-radius-base)',
                    color: 'var(--ha-text-primary)',
                    fontSize: 'var(--ha-text-sm)',
                    cursor: statusMutation.isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  <option value={ALERT_STATUS.OPEN}>New</option>
                  <option value={ALERT_STATUS.IN_PROGRESS}>In Review</option>
                  <option value={ALERT_STATUS.RESOLVED}>Resolved</option>
                  <option value={ALERT_STATUS.FALSE_POSITIVE}>False Positive</option>
                </select>
              ) : (
                <div
                  title={QUEUE_TRIAGE_DENIED}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--ha-surface-raised)',
                    borderRadius: 'var(--ha-radius-base)',
                    fontSize: 'var(--ha-text-sm)',
                    color: 'var(--ha-text-secondary)',
                  }}
                >
                  <span
                    style={{
                      padding: '2px 8px',
                      background: 'var(--ha-background)',
                      borderRadius: 'var(--ha-radius-sm)',
                    }}
                  >
                    {alert.status}
                  </span>
                  <span style={{ marginLeft: 8, fontSize: 'var(--ha-text-xs)' }}>
                    (read-only — {QUEUE_TRIAGE_DENIED})
                  </span>
                </div>
              )}
            </div>

            {/* Section 6 — Related Alerts */}
            <RelatedAlertsSection alertId={alert.id} onSelectAlert={handleSelectRelatedAlert} />
          </>
        )}
      </div>

      {alert && (
        <div
          style={{
            height: 56,
            padding: '0 16px',
            borderTop: '1px solid var(--ha-border)',
            background: 'var(--ha-surface-raised)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            gap: 12,
          }}
        >
          <Link
            to={`/alerts/${alert.id}`}
            style={{ color: 'var(--ha-primary)', fontSize: 'var(--ha-text-sm)', textDecoration: 'none' }}
          >
            View full detail
          </Link>
          <button
            type="button"
            style={{
              background: canTriage ? 'var(--ha-primary)' : 'var(--ha-surface-primary)',
              color: canTriage ? 'var(--ha-background)' : 'var(--ha-text-secondary)',
              border: canTriage ? 'none' : '1px solid var(--ha-border)',
              padding: '8px 16px',
              borderRadius: 'var(--ha-radius-base)',
              fontSize: 'var(--ha-text-sm)',
              fontWeight: 600,
              cursor: canTriage ? 'pointer' : 'not-allowed',
              opacity: canTriage ? 1 : 0.65,
            }}
            aria-label="Escalate this alert to an incident"
            disabled={!canTriage}
            title={canTriage ? undefined : QUEUE_TRIAGE_DENIED}
            onClick={() => {
              if (!canTriage || !alertId) return;
              onEscalate?.(alertId);
            }}
          >
            Escalate to incident
          </button>
        </div>
      )}
    </div>
  );
}
