/**
 * HiveIntelligencePage — INV-07
 * Threat intelligence hub — IOC feeds, indicator browser, enrichment lookup
 *
 * Honesty boundary (STAGING CANDIDATE):
 * - Reads: feeds, IOCs, lookup, and aggregate stats from secured /api/ha-threat-intel/*
 * - Feed enable/sync mutations remain Platform Administrator only (backend ADMIN)
 * - Legacy unsecured /api/v1/threat-intel is not called
 */

import { useState } from 'react';

import { Label, Tooltip } from '@patternfly/react-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, RefreshCw, Search } from 'lucide-react';

import { TlpBadge } from '@/components/tlp-badge/TlpBadge';
import { ROLE_LABELS } from '@/lib/roles';
import { threatIntelService } from '@/services/threatIntel.service';
import { useAuthStore } from '@/store/auth.store';
import type { ThreatFeedDTO } from '@/types/threatIntel.types';

/** Matches AuthGuard on /intelligence and backend lookup/IOC authorities. */
const INTELLIGENCE_READ_ROLES = [
  'ROLE_ADMIN',
  'ROLE_SOC_MANAGER',
  'ROLE_ANALYST',
  'ROLE_USER',
] as const;

function formatStatCount(value: number | undefined): string {
  if (value === undefined) return '—';
  return new Intl.NumberFormat().format(value);
}

export function HiveIntelligencePage(): JSX.Element {
  const hasRequiredRole = useAuthStore((state) =>
    state.hasAnyRole([...INTELLIGENCE_READ_ROLES])
  );
  const hasAdminRole = useAuthStore((state) => state.hasRole('ROLE_ADMIN'));

  const [selectedFeed, setSelectedFeed] = useState<ThreatFeedDTO | null>(null);
  const [feedSearchQuery, setFeedSearchQuery] = useState('');
  const [enrichValue, setEnrichValue] = useState('');
  const [enrichType, setEnrichType] = useState('ip');

  const queryClient = useQueryClient();

  const {
    data: feeds,
    isLoading: isFeedsLoading,
    isError: isFeedsError,
    error: feedsError,
  } = useQuery({
    queryKey: ['threatFeeds'],
    queryFn: threatIntelService.listFeeds,
    enabled: hasRequiredRole,
  });

  const {
    data: iocStats,
    isLoading: isStatsLoading,
    isError: isStatsError,
  } = useQuery({
    queryKey: ['ioc-stats'],
    queryFn: () => threatIntelService.getIocStats(),
    enabled: hasRequiredRole,
    refetchInterval: 60_000,
  });

  const {
    data: iocs,
    isLoading: isIocsLoading,
    isError: isIocsError,
  } = useQuery({
    queryKey: ['iocs', selectedFeed?.id],
    queryFn: () =>
      threatIntelService.searchIocs({
        feedId: selectedFeed?.id,
        page: 0,
        size: 100,
      }),
    enabled: !!selectedFeed,
  });

  const toggleFeedMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      threatIntelService.toggleFeed(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threatFeeds'] });
      queryClient.invalidateQueries({ queryKey: ['ioc-stats'] });
    },
  });

  const syncFeedMutation = useMutation({
    mutationFn: (id: string) => threatIntelService.syncFeed(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threatFeeds'] });
      queryClient.invalidateQueries({ queryKey: ['iocs'] });
      queryClient.invalidateQueries({ queryKey: ['ioc-stats'] });
    },
  });

  const enrichMutation = useMutation({
    mutationFn: () => threatIntelService.lookupIoc({ value: enrichValue, type: enrichType }),
  });

  const filteredFeeds = feeds?.filter((f) =>
    f.name.toLowerCase().includes(feedSearchQuery.toLowerCase())
  );

  const enabledCount = feeds?.filter((f) => f.enabled).length ?? 0;
  const totalCount = feeds?.length ?? 0;

  if (!hasRequiredRole) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: 'var(--ha-background)',
        }}
      >
        <div
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            padding: '48px',
            textAlign: 'center',
            maxWidth: '600px',
          }}
        >
          <AlertCircle size={48} style={{ color: 'var(--ha-high)', marginBottom: '16px' }} />
          <h1 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)' }}>
            Access Denied
          </h1>
          <p style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-secondary)' }}>
            Required permission: {ROLE_LABELS.ROLE_ANALYST}, {ROLE_LABELS.ROLE_SOC_MANAGER}, or{' '}
            Platform Administrator.
          </p>
        </div>
      </div>
    );
  }

  if (isFeedsLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <Loader2 size={32} style={{ color: 'var(--ha-primary)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (isFeedsError) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: 'var(--ha-background)',
        }}
      >
        <div
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            padding: '48px',
            textAlign: 'center',
            maxWidth: '600px',
          }}
        >
          <AlertCircle size={48} style={{ color: 'var(--ha-critical)', marginBottom: '16px' }} />
          <h1 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)' }}>
            Error Loading Feeds
          </h1>
          <p style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-secondary)' }}>
            {feedsError instanceof Error ? feedsError.message : 'An unknown error occurred'}
          </p>
        </div>
      </div>
    );
  }

  const statsStrip = (
    <div
      role="region"
      aria-label="IOC inventory summary"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        padding: '10px 16px',
        borderBottom: '1px solid var(--ha-border)',
        background: 'var(--ha-surface-raised)',
        fontSize: 'var(--ha-text-xs)',
        color: 'var(--ha-text-secondary)',
      }}
    >
      {isStatsLoading && <span>Loading IOC stats…</span>}
      {isStatsError && (
        <span style={{ color: 'var(--ha-high)' }}>
          IOC stats unavailable — feed and lookup reads may still work.
        </span>
      )}
      {!isStatsLoading && !isStatsError && (
        <>
          <span>
            Active IOCs:{' '}
            <strong style={{ color: 'var(--ha-text-primary)' }}>
              {formatStatCount(iocStats?.totalActive)}
            </strong>
          </span>
          <span>
            IPs:{' '}
            <strong style={{ color: 'var(--ha-text-primary)' }}>
              {formatStatCount(iocStats?.byType?.ip)}
            </strong>
          </span>
          <span>
            Domains:{' '}
            <strong style={{ color: 'var(--ha-text-primary)' }}>
              {formatStatCount(iocStats?.byType?.domain)}
            </strong>
          </span>
          <span>
            Hashes:{' '}
            <strong style={{ color: 'var(--ha-text-primary)' }}>
              {formatStatCount(iocStats?.byType?.hash)}
            </strong>
          </span>
          <span>
            Expired today:{' '}
            <strong style={{ color: 'var(--ha-text-primary)' }}>
              {formatStatCount(iocStats?.expiredToday)}
            </strong>
          </span>
        </>
      )}
      {!hasAdminRole && (
        <span style={{ marginLeft: 'auto' }}>
          Feed enable/sync requires Platform Administrator — browse and lookup remain available.
        </span>
      )}
    </div>
  );

  if (!feeds || feeds.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: 'var(--ha-background)',
        }}
      >
        {statsStrip}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <div
            style={{
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              padding: '48px',
              textAlign: 'center',
              maxWidth: '600px',
            }}
          >
            <h1 style={{ fontSize: 'var(--ha-text-xl)', color: 'var(--ha-text-primary)' }}>
              No Threat Feeds
            </h1>
            <p style={{ fontSize: 'var(--ha-text-base)', color: 'var(--ha-text-secondary)' }}>
              No threat intelligence feeds are configured.
              {hasAdminRole
                ? ' Configure TAXII or MISP sources under Admin → Threat Intelligence.'
                : ' Ask a Platform Administrator to configure feed sources.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ha-background)',
        overflow: 'hidden',
      }}
    >
      {statsStrip}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Left Panel - Feed List */}
      <div
        style={{
          width: '320px',
          borderRight: '1px solid var(--ha-border)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--ha-surface-primary)',
        }}
      >
        <div style={{ padding: '16px', borderBottom: '1px solid var(--ha-border)' }}>
          <h2
            style={{
              fontSize: 'var(--ha-text-md)',
              fontWeight: 600,
              color: 'var(--ha-text-primary)',
              marginBottom: '12px',
            }}
          >
            Threat Feeds
          </h2>
          <input
            type="text"
            placeholder="Search feeds..."
            value={feedSearchQuery}
            onChange={(e) => setFeedSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--ha-background)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              color: 'var(--ha-text-primary)',
              fontSize: 'var(--ha-text-sm)',
            }}
          />
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          {filteredFeeds?.map((feed) => (
            <div
              key={feed.id}
              onClick={() => setSelectedFeed(feed)}
              style={{
                padding: '12px',
                marginBottom: '4px',
                background:
                  selectedFeed?.id === feed.id ? 'var(--ha-background)' : 'transparent',
                border:
                  selectedFeed?.id === feed.id
                    ? '1px solid var(--ha-primary)'
                    : '1px solid transparent',
                borderRadius: 'var(--ha-radius-base)',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--ha-text-sm)',
                    fontWeight: 600,
                    color: 'var(--ha-text-primary)',
                  }}
                >
                  {feed.name}
                </span>
                {hasAdminRole ? (
                  <input
                    type="checkbox"
                    checked={feed.enabled}
                    aria-label={`${feed.name} enabled`}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleFeedMutation.mutate({ id: feed.id, enabled: e.target.checked });
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                ) : (
                  <span
                    style={{
                      fontSize: 'var(--ha-text-xs)',
                      color: feed.enabled ? 'var(--ha-positive)' : 'var(--ha-text-secondary)',
                    }}
                  >
                    {feed.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    padding: '2px 6px',
                    borderRadius: 'var(--ha-radius-sm)',
                    fontSize: 'var(--ha-text-xs)',
                    fontWeight: 600,
                    background:
                      feed.sourceType === 'OSINT'
                        ? 'var(--ha-fill-primary-muted)'
                        : 'var(--ha-fill-intelligence-muted)',
                    color:
                      feed.sourceType === 'OSINT' ? 'var(--ha-primary)' : 'var(--ha-intelligence)',
                  }}
                >
                  {feed.sourceType}
                </span>
                <span
                  style={{
                    fontSize: 'var(--ha-text-xs)',
                    color: 'var(--ha-text-secondary)',
                  }}
                >
                  {feed.indicatorCount} IOCs
                </span>
              </div>
              {feed.lastUpdated && (
                <div
                  style={{
                    fontSize: 'var(--ha-text-xs)',
                    color: 'var(--ha-text-secondary)',
                    marginTop: '4px',
                  }}
                >
                  Updated: {new Date(feed.lastUpdated).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--ha-border)',
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
          }}
        >
          {enabledCount} of {totalCount} feeds enabled
        </div>
      </div>

      {/* Right Panel - Feed Detail & IOC Browser */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedFeed ? (
          <>
            {/* Feed Detail Header */}
            <div
              style={{
                padding: '24px',
                borderBottom: '1px solid var(--ha-border)',
                background: 'var(--ha-surface-raised)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <h2
                  style={{
                    fontSize: 'var(--ha-text-lg)',
                    fontWeight: 600,
                    color: 'var(--ha-text-primary)',
                  }}
                >
                  {selectedFeed.name}
                </h2>
                {hasAdminRole && (
                  <button
                    onClick={() => syncFeedMutation.mutate(selectedFeed.id)}
                    disabled={syncFeedMutation.isPending}
                    style={{
                      padding: '6px 12px',
                      background: 'var(--ha-surface-primary)',
                      border: '1px solid var(--ha-border)',
                      borderRadius: 'var(--ha-radius-base)',
                      color: 'var(--ha-text-primary)',
                      fontSize: 'var(--ha-text-sm)',
                      cursor: syncFeedMutation.isPending ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <RefreshCw
                      size={14}
                      style={{
                        animation: syncFeedMutation.isPending ? 'spin 1s linear infinite' : 'none',
                      }}
                    />
                    Sync
                  </button>
                )}
              </div>
              {selectedFeed.description && (
                <p
                  style={{
                    fontSize: 'var(--ha-text-sm)',
                    color: 'var(--ha-text-secondary)',
                    marginBottom: '12px',
                  }}
                >
                  {selectedFeed.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: '16px', fontSize: 'var(--ha-text-sm)' }}>
                <span style={{ color: 'var(--ha-text-secondary)' }}>
                  Indicators: <strong style={{ color: 'var(--ha-text-primary)' }}>{selectedFeed.indicatorCount}</strong>
                </span>
                {selectedFeed.lastUpdated && (
                  <span style={{ color: 'var(--ha-text-secondary)' }}>
                    Last Updated:{' '}
                    <strong style={{ color: 'var(--ha-text-primary)' }}>
                      {new Date(selectedFeed.lastUpdated).toLocaleString()}
                    </strong>
                  </span>
                )}
              </div>
            </div>

            {/* IOC Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
              {isIocsLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                  <Loader2
                    size={32}
                    style={{ color: 'var(--ha-primary)', animation: 'spin 1s linear infinite' }}
                  />
                </div>
              )}

              {isIocsError && (
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--ha-text-secondary)' }}>
                  Failed to load indicators
                </div>
              )}

              {iocs && iocs.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--ha-text-secondary)' }}>
                  No indicators in this feed
                </div>
              )}

              {iocs && iocs.length > 0 && (
                <div
                  style={{
                    background: 'var(--ha-surface-primary)',
                    border: '1px solid var(--ha-border)',
                    borderRadius: 'var(--ha-radius-base)',
                    overflow: 'hidden',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--ha-surface-raised)' }}>
                        <th
                          style={{
                            padding: '12px',
                            textAlign: 'left',
                            fontSize: 'var(--ha-text-xs)',
                            fontWeight: 600,
                            color: 'var(--ha-text-secondary)',
                            textTransform: 'uppercase',
                          }}
                        >
                          Value
                        </th>
                        <th
                          style={{
                            padding: '12px',
                            textAlign: 'left',
                            fontSize: 'var(--ha-text-xs)',
                            fontWeight: 600,
                            color: 'var(--ha-text-secondary)',
                            textTransform: 'uppercase',
                          }}
                        >
                          Type
                        </th>
                        <th
                          style={{
                            padding: '12px',
                            textAlign: 'left',
                            fontSize: 'var(--ha-text-xs)',
                            fontWeight: 600,
                            color: 'var(--ha-text-secondary)',
                            textTransform: 'uppercase',
                          }}
                        >
                          Threat Score
                        </th>
                        <th
                          style={{
                            padding: '12px',
                            textAlign: 'left',
                            fontSize: 'var(--ha-text-xs)',
                            fontWeight: 600,
                            color: 'var(--ha-text-secondary)',
                            textTransform: 'uppercase',
                          }}
                        >
                          Last Seen
                        </th>
                        <th
                          style={{
                            padding: '12px',
                            textAlign: 'left',
                            fontSize: 'var(--ha-text-xs)',
                            fontWeight: 600,
                            color: 'var(--ha-text-secondary)',
                            textTransform: 'uppercase',
                          }}
                        >
                          TLP
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {iocs.map((ioc) => (
                        <tr
                          key={ioc.id}
                          style={{
                            borderTop: '1px solid var(--ha-border)',
                          }}
                        >
                          <td
                            style={{
                              padding: '12px',
                              fontSize: 'var(--ha-text-sm)',
                              color: 'var(--ha-text-primary)',
                              fontFamily: 'var(--ha-font-mono)',
                            }}
                          >
                            {ioc.restricted === true ? (
                              <Label color="red">TLP:RED — Restricted</Label>
                            ) : ioc.tlp === 'AMBER' && ioc.value.includes('*') ? (
                              <Tooltip content="Full value restricted (TLP:AMBER)">
                                <span>{ioc.value}</span>
                              </Tooltip>
                            ) : (
                              ioc.value
                            )}
                          </td>
                          <td
                            style={{
                              padding: '12px',
                              fontSize: 'var(--ha-text-sm)',
                              color: 'var(--ha-text-secondary)',
                            }}
                          >
                            {ioc.iocType}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span
                              style={{
                                padding: '4px 8px',
                                borderRadius: 'var(--ha-radius-sm)',
                                fontSize: 'var(--ha-text-xs)',
                                fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums',
                                background:
                                  ioc.threatScore >= 75
                                    ? 'var(--ha-fill-critical-muted)'
                                    : ioc.threatScore >= 40
                                    ? 'var(--ha-fill-high-muted)'
                                    : 'var(--ha-fill-neutral-muted)',
                                color:
                                  ioc.threatScore >= 75
                                    ? 'var(--ha-critical)'
                                    : ioc.threatScore >= 40
                                    ? 'var(--ha-high)'
                                    : 'var(--ha-text-secondary)',
                              }}
                            >
                              {ioc.threatScore}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: '12px',
                              fontSize: 'var(--ha-text-sm)',
                              color: 'var(--ha-text-secondary)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {ioc.lastSeen ? new Date(ioc.lastSeen).toLocaleDateString() : '—'}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <TlpBadge tlp={ioc.tlp} size="sm" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* IOC Enrichment Bar */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--ha-border)',
                background: 'var(--ha-surface-raised)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                }}
              >
                <select
                  value={enrichType}
                  onChange={(e) => setEnrichType(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--ha-background)',
                    border: '1px solid var(--ha-border)',
                    borderRadius: 'var(--ha-radius-base)',
                    color: 'var(--ha-text-primary)',
                    fontSize: 'var(--ha-text-sm)',
                  }}
                >
                  <option value="ip">IP</option>
                  <option value="domain">Domain</option>
                  <option value="hash">Hash</option>
                  <option value="url">URL</option>
                </select>
                <input
                  type="text"
                  placeholder="Enter value to enrich..."
                  value={enrichValue}
                  onChange={(e) => setEnrichValue(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: 'var(--ha-background)',
                    border: '1px solid var(--ha-border)',
                    borderRadius: 'var(--ha-radius-base)',
                    color: 'var(--ha-text-primary)',
                    fontSize: 'var(--ha-text-sm)',
                  }}
                />
                <button
                  onClick={() => enrichMutation.mutate()}
                  disabled={!enrichValue || enrichMutation.isPending}
                  style={{
                    padding: '8px 16px',
                    background: !enrichValue || enrichMutation.isPending ? 'var(--ha-border)' : 'var(--ha-primary)',
                    color: 'var(--ha-background)',
                    border: 'none',
                    borderRadius: 'var(--ha-radius-base)',
                    fontSize: 'var(--ha-text-sm)',
                    fontWeight: 600,
                    cursor: !enrichValue || enrichMutation.isPending ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Search size={16} />
                  Enrich
                </button>
              </div>

              {enrichMutation.data && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '16px',
                    background: 'var(--ha-background)',
                    border: '1px solid var(--ha-border)',
                    borderRadius: 'var(--ha-radius-base)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--ha-text-sm)',
                        fontFamily: 'var(--ha-font-mono)',
                        color: 'var(--ha-text-primary)',
                        fontWeight: 600,
                      }}
                    >
                      {enrichMutation.data.summary.iocValue}
                    </span>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: 'var(--ha-radius-sm)',
                        fontSize: 'var(--ha-text-xs)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        background:
                          enrichMutation.data.summary.verdict === 'malicious'
                            ? 'var(--ha-fill-critical-muted)'
                            : enrichMutation.data.summary.verdict === 'suspicious'
                            ? 'var(--ha-fill-high-muted)'
                            : 'var(--ha-fill-neutral-muted)',
                        color:
                          enrichMutation.data.summary.verdict === 'malicious'
                            ? 'var(--ha-critical)'
                            : enrichMutation.data.summary.verdict === 'suspicious'
                            ? 'var(--ha-high)'
                            : 'var(--ha-text-secondary)',
                      }}
                    >
                      {enrichMutation.data.summary.verdict}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--ha-text-sm)',
                      color: 'var(--ha-text-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {enrichMutation.data.summary.sourceFeed && (
                      <div>Source: {enrichMutation.data.summary.sourceFeed}</div>
                    )}
                    {enrichMutation.data.summary.firstSeen && (
                      <div>
                        First Seen: {new Date(enrichMutation.data.summary.firstSeen).toLocaleString()}
                      </div>
                    )}
                    {enrichMutation.data.summary.attackTechniques.length > 0 && (
                      <div>Techniques: {enrichMutation.data.summary.attackTechniques.join(', ')}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ha-text-secondary)',
            }}
          >
            Select a feed to view details
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
