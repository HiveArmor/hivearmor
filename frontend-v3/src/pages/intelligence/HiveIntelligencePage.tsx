/**
 * HiveIntelligencePage — Prompt 13
 * Threat intelligence + assistive SOC AI workbench (STAGING CANDIDATE).
 *
 * Primary job: IOC lookup + feed honesty.
 * Secondary: assistive SOC AI Q&A — never silent autonomous mutate.
 *
 * Confirmed APIs only:
 *   GET/PUT /api/ha-threat-intel/feeds, POST .../sync, POST /lookup, GET /iocs
 *   POST /api/ha-soc-ai/query
 * Never call legacy /api/v1/threat-intel (TI-003).
 */

import { useState } from 'react';

import { Label, Tooltip } from '@patternfly/react-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Brain, Loader2, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { TlpBadge } from '@/components/tlp-badge/TlpBadge';
import { ApiError } from '@/lib/apiClient';
import { ROLE_LABELS } from '@/lib/roles';
import {
  canQuerySocAi,
  formatSocAiHttpHonesty,
  isSocAiUnavailableAnswer,
  socAiService,
} from '@/services/socAi.service';
import {
  canMutateThreatIntelFeeds,
  canReadThreatIntel,
} from '@/services/threatIntel.capabilities';
import { threatIntelService } from '@/services/threatIntel.service';
import { useAuthStore } from '@/store/auth.store';
import type { ThreatFeedDTO } from '@/types/threatIntel.types';

import './HiveIntelligencePage.css';

/** Bundle-visible job sentence — TI workbench + assistive AI, not silent automation. */
export const INTELLIGENCE_JOB_SENTENCE =
  'Threat intelligence — look up indicators, inspect feed health, and ask assistive SOC AI. AI never acts silently.';

const IOC_PAGE_SIZE = 50;
const visualFixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

function formatStatCount(value: number | undefined): string {
  if (value === undefined) return '—';
  return new Intl.NumberFormat().format(value);
}

function verdictClass(verdict: string): string {
  switch (verdict) {
    case 'malicious':
      return 'hi-verdict hi-verdict--malicious';
    case 'suspicious':
      return 'hi-verdict hi-verdict--suspicious';
    case 'clean':
      return 'hi-verdict hi-verdict--clean';
    default:
      return 'hi-verdict hi-verdict--unknown';
  }
}

function scoreClass(score: number): string {
  if (score >= 75) return 'hi-score hi-score--high';
  if (score >= 40) return 'hi-score hi-score--mid';
  return 'hi-score hi-score--low';
}

function lookupErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 503) {
      return 'IOC lookup unavailable (HTTP 503). No fabricated hits are shown.';
    }
    if (error.status === 404) {
      return 'No indicator match returned for this value.';
    }
    return `Lookup failed (HTTP ${error.status}).`;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Lookup failed.';
}

function huntQueryForIoc(value: string): string {
  return encodeURIComponent(value);
}

export function HiveIntelligencePage(): JSX.Element {
  const roles = useAuthStore((state) => state.user?.roles ?? []);
  const hasRequiredRole = canReadThreatIntel(roles);
  const hasAdminRole = canMutateThreatIntelFeeds(roles);
  const hasSocAiRole = canQuerySocAi(roles);

  const [selectedFeed, setSelectedFeed] = useState<ThreatFeedDTO | null>(null);
  const [feedSearchQuery, setFeedSearchQuery] = useState('');
  const [enrichValue, setEnrichValue] = useState('');
  const [enrichType, setEnrichType] = useState('ip');
  const [iocPage, setIocPage] = useState(0);
  const [aiPrompt, setAiPrompt] = useState('');

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
    data: iocPageResult,
    isLoading: isIocsLoading,
    isError: isIocsError,
  } = useQuery({
    queryKey: ['iocs', selectedFeed?.id, iocPage],
    queryFn: ({ signal }) =>
      threatIntelService.searchIocsPage(
        {
          feedId: selectedFeed?.id,
          page: iocPage,
          size: IOC_PAGE_SIZE,
        },
        signal
      ),
    enabled: hasRequiredRole && !!selectedFeed,
  });

  const iocs = iocPageResult?.items;
  const iocTotal = iocPageResult?.total ?? 0;
  const iocHasMore = (iocPage + 1) * IOC_PAGE_SIZE < iocTotal;

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
    mutationFn: () => threatIntelService.lookupIoc({ value: enrichValue.trim(), type: enrichType }),
  });

  const aiMutation = useMutation({
    mutationFn: () =>
      socAiService.query({
        prompt: aiPrompt.trim(),
        context: enrichValue.trim()
          ? `Analyst is investigating IOC ${enrichType}:${enrichValue.trim()}`
          : undefined,
      }),
  });

  const filteredFeeds = feeds?.filter((f) =>
    f.name.toLowerCase().includes(feedSearchQuery.toLowerCase())
  );

  const enabledCount = feeds?.filter((f) => f.enabled).length ?? 0;
  const totalCount = feeds?.length ?? 0;

  if (!hasRequiredRole) {
    return (
      <section className="hi-page" aria-label="Hive Intelligence">
        <div className="hi-center">
          <div className="hi-center__card">
            <AlertCircle size={40} style={{ color: 'var(--ha-high)', marginBottom: 12 }} aria-hidden />
            <h1>Access Denied</h1>
            <p>
              Required permission: {ROLE_LABELS.ROLE_ANALYST}, {ROLE_LABELS.ROLE_SOC_MANAGER}, or{' '}
              {ROLE_LABELS.ROLE_ADMIN}.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="hi-page" aria-label="Hive Intelligence">
      {visualFixtureMode && (
        <div className="hi-page__fixture" role="status">
          <strong>Design fixture:</strong> foundation fixtures are enabled for visual review.
          <span>Production builds never receive fixture IOC or AI answers.</span>
        </div>
      )}

      <header className="hi-page__header">
        <div className="hi-page__title-icon">
          <Brain size={20} aria-hidden="true" />
        </div>
        <div className="hi-page__title">
          <div className="hi-page__eyebrow">
            <span>Threat intel workbench</span>
            <span className="hi-page__badge">STAGING CANDIDATE</span>
          </div>
          <h1>Hive Intelligence</h1>
          <p className="hi-page__job">{INTELLIGENCE_JOB_SENTENCE}</p>
        </div>
      </header>

      <p className="hi-page__meta">
        <Link to="/dashboard">Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to="/search">Search &amp; Hunt</Link>
        <span aria-hidden="true">·</span>
        <Link to="/entities">Entities</Link>
        <span aria-hidden="true">·</span>
        <Link to="/alerts">Alerts</Link>
        <span aria-hidden="true">·</span>
        <Link to="/incidents">Incidents</Link>
        <span aria-hidden="true">·</span>
        <Link to="/ueba/risk">UEBA risk</Link>
        <span aria-hidden="true">·</span>
        <Link to="/constellation">Constellation</Link>
      </p>

      <div
        className="hi-page__stats"
        role="region"
        aria-label="IOC inventory summary"
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
              Active IOCs: <strong>{formatStatCount(iocStats?.totalActive)}</strong>
            </span>
            <span>
              IPs: <strong>{formatStatCount(iocStats?.byType?.ip)}</strong>
            </span>
            <span>
              Domains: <strong>{formatStatCount(iocStats?.byType?.domain)}</strong>
            </span>
            <span>
              Hashes: <strong>{formatStatCount(iocStats?.byType?.hash)}</strong>
            </span>
            <span>
              Expired today: <strong>{formatStatCount(iocStats?.expiredToday)}</strong>
            </span>
          </>
        )}
        {!hasAdminRole && (
          <span style={{ marginLeft: 'auto' }}>
            Feed enable/sync requires {ROLE_LABELS.ROLE_ADMIN} — browse and lookup remain available.
          </span>
        )}
      </div>

      <div className="hi-page__workspace">
        <div className="hi-page__primary">
          <section className="hi-panel" aria-label="IOC lookup">
            <div className="hi-panel__head">
              <h2>IOC lookup</h2>
              <p>Primary action — enrich against configured feeds. No synthetic hits.</p>
            </div>
            <form
              className="hi-lookup"
              onSubmit={(event) => {
                event.preventDefault();
                if (enrichValue.trim()) enrichMutation.mutate();
              }}
            >
              <select
                value={enrichType}
                onChange={(e) => setEnrichType(e.target.value)}
                aria-label="IOC type"
              >
                <option value="ip">IP</option>
                <option value="domain">Domain</option>
                <option value="hash">Hash</option>
                <option value="url">URL</option>
              </select>
              <input
                type="text"
                placeholder="Enter indicator value…"
                value={enrichValue}
                onChange={(e) => setEnrichValue(e.target.value)}
                aria-label="IOC value"
                autoComplete="off"
              />
              <button type="submit" disabled={!enrichValue.trim() || enrichMutation.isPending}>
                {enrichMutation.isPending ? (
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} aria-hidden />
                ) : (
                  <Search size={16} aria-hidden />
                )}
                Look up
              </button>
            </form>

            {enrichMutation.isError && (
              <div className="hi-honesty hi-honesty--error" role="alert">
                {lookupErrorMessage(enrichMutation.error)}
              </div>
            )}

            {enrichMutation.isSuccess && enrichMutation.data && (
              <div className="hi-result" role="region" aria-label="IOC lookup result">
                <div className="hi-result__row">
                  <span className="hi-result__value">{enrichMutation.data.summary.iocValue}</span>
                  <span className={verdictClass(enrichMutation.data.summary.verdict)}>
                    {enrichMutation.data.summary.verdict}
                  </span>
                </div>
                {enrichMutation.data.summary.verdict === 'unknown' && !enrichMutation.data.detail && (
                  <p className="hi-honesty">
                    No matching indicator in configured feeds for this value.
                  </p>
                )}
                <div className="hi-result__meta">
                  {enrichMutation.data.summary.sourceFeed && (
                    <div>Source feed: {enrichMutation.data.summary.sourceFeed}</div>
                  )}
                  {enrichMutation.data.summary.firstSeen && (
                    <div>
                      First seen: {new Date(enrichMutation.data.summary.firstSeen).toLocaleString()}
                    </div>
                  )}
                  {enrichMutation.data.summary.attackTechniques.length > 0 && (
                    <div>
                      Techniques: {enrichMutation.data.summary.attackTechniques.join(', ')}
                    </div>
                  )}
                </div>
                <div className="hi-result__pivots">
                  <Link to={`/search?q=${huntQueryForIoc(enrichMutation.data.summary.iocValue)}`}>
                    Hunt in Search
                  </Link>
                  <Link to="/entities">Open Entities</Link>
                  <Link to="/alerts">Open Alerts</Link>
                </div>
              </div>
            )}
          </section>

          {selectedFeed ? (
            <section className="hi-ioc-browser" aria-label="Feed indicator browser">
              <div className="hi-ioc-browser__head">
                <div>
                  <h2>{selectedFeed.name}</h2>
                  <p className="hi-panel__hint">
                    {selectedFeed.indicatorCount.toLocaleString()} indicators
                    {selectedFeed.lastUpdated
                      ? ` · updated ${new Date(selectedFeed.lastUpdated).toLocaleString()}`
                      : ' · last update unknown'}
                  </p>
                </div>
                {hasAdminRole && (
                  <button
                    type="button"
                    className="hi-feed-card__sync"
                    onClick={() => syncFeedMutation.mutate(selectedFeed.id)}
                    disabled={syncFeedMutation.isPending}
                  >
                    <RefreshCw
                      size={14}
                      style={{
                        animation: syncFeedMutation.isPending ? 'spin 1s linear infinite' : 'none',
                      }}
                      aria-hidden
                    />
                    Sync feed
                  </button>
                )}
              </div>

              {isIocsLoading && (
                <div className="hi-center">
                  <Loader2
                    size={28}
                    style={{ color: 'var(--ha-primary)', animation: 'spin 1s linear infinite' }}
                    aria-hidden
                  />
                </div>
              )}

              {isIocsError && (
                <div className="hi-honesty hi-honesty--error" role="alert">
                  Failed to load indicators for this feed.
                </div>
              )}

              {!isIocsLoading && !isIocsError && iocs && iocs.length === 0 && (
                <div className="hi-honesty">No indicators in this feed.</div>
              )}

              {iocs && iocs.length > 0 && (
                <div className="hi-ioc-table-wrap">
                  <table className="hi-ioc-table">
                    <thead>
                      <tr>
                        <th>Value</th>
                        <th>Type</th>
                        <th>Threat score</th>
                        <th>Last seen</th>
                        <th>TLP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {iocs.map((ioc) => (
                        <tr key={ioc.id}>
                          <td>
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
                          <td>{ioc.iocType}</td>
                          <td>
                            <span className={scoreClass(ioc.threatScore)}>{ioc.threatScore}</span>
                          </td>
                          <td>
                            {ioc.lastSeen ? new Date(ioc.lastSeen).toLocaleDateString() : '—'}
                          </td>
                          <td>
                            <TlpBadge tlp={ioc.tlp} size="sm" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="hi-pager" role="navigation" aria-label="IOC pagination">
                    <span>
                      {iocTotal.toLocaleString()} indicator{iocTotal === 1 ? '' : 's'} · page{' '}
                      {iocPage + 1}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        disabled={iocPage === 0 || isIocsLoading}
                        onClick={() => setIocPage((page) => Math.max(0, page - 1))}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={!iocHasMore || isIocsLoading}
                        onClick={() => setIocPage((page) => page + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <div className="hi-ioc-browser">
              <div className="hi-honesty">
                Select a feed on the right to browse its indicators. Lookup above works without a
                feed selection.
              </div>
            </div>
          )}
        </div>

        <aside className="hi-page__side" aria-label="Feeds and assistive AI">
          <section className="hi-panel" aria-label="Threat feeds">
            <div className="hi-panel__head">
              <h2>Feeds</h2>
              <p>Health from API — no decorative greens without data.</p>
            </div>

            {isFeedsLoading && (
              <div className="hi-honesty">Loading feeds…</div>
            )}

            {isFeedsError && (
              <div className="hi-honesty hi-honesty--error" role="alert">
                {feedsError instanceof Error
                  ? feedsError.message
                  : 'Failed to load threat feeds.'}
              </div>
            )}

            {!isFeedsLoading && !isFeedsError && (!feeds || feeds.length === 0) && (
              <div className="hi-honesty hi-honesty--warn">
                No threat intelligence feeds are configured.
                {hasAdminRole
                  ? ' Configure TAXII or MISP sources under Admin → Threat Intelligence.'
                  : ` Ask a ${ROLE_LABELS.ROLE_ADMIN} to configure feed sources.`}
              </div>
            )}

            {feeds && feeds.length > 0 && (
              <>
                <input
                  className="hi-feeds__search"
                  type="search"
                  placeholder="Filter feeds…"
                  value={feedSearchQuery}
                  onChange={(e) => setFeedSearchQuery(e.target.value)}
                  aria-label="Filter feeds"
                />
                <div className="hi-feed-list">
                  {filteredFeeds?.map((feed) => (
                    <div
                      key={feed.id}
                      className={
                        selectedFeed?.id === feed.id
                          ? 'hi-feed-card hi-feed-card--selected'
                          : 'hi-feed-card'
                      }
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedFeed(feed);
                        setIocPage(0);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedFeed(feed);
                          setIocPage(0);
                        }
                      }}
                    >
                      <div className="hi-feed-card__top">
                        <span className="hi-feed-card__name">{feed.name}</span>
                        {hasAdminRole ? (
                          <input
                            type="checkbox"
                            checked={feed.enabled}
                            aria-label={`${feed.name} enabled`}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleFeedMutation.mutate({
                                id: feed.id,
                                enabled: e.target.checked,
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            className={
                              feed.enabled ? 'hi-feed-status--on' : 'hi-feed-status--off'
                            }
                          >
                            {feed.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        )}
                      </div>
                      <div className="hi-feed-card__meta">
                        <span
                          className={
                            feed.sourceType === 'OSINT'
                              ? 'hi-feed-chip hi-feed-chip--osint'
                              : 'hi-feed-chip hi-feed-chip--other'
                          }
                        >
                          {feed.sourceType}
                        </span>
                        <span>{feed.indicatorCount.toLocaleString()} IOCs</span>
                        {feed.lastUpdated ? (
                          <span>Updated {new Date(feed.lastUpdated).toLocaleDateString()}</span>
                        ) : (
                          <span>Never synced</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="hi-feeds__footer">
                  {enabledCount} of {totalCount} feeds enabled
                </p>
              </>
            )}
          </section>

          <section className="hi-panel hi-ai" aria-label="Assistive SOC AI">
            <div className="hi-panel__head">
              <h2>Assistive SOC AI</h2>
              <span className="hi-page__badge">Assist only</span>
            </div>
            <p className="hi-panel__hint">
              Ask questions about indicators or tradecraft. Answers are assistive evidence with
              provenance when available — never autonomous response.
            </p>

            {!hasSocAiRole ? (
              <div className="hi-honesty">
                Required permission: {ROLE_LABELS.ROLE_ANALYST}, {ROLE_LABELS.ROLE_SOC_MANAGER}, or{' '}
                {ROLE_LABELS.ROLE_ADMIN}.
              </div>
            ) : (
              <>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. What should I check for this IOC before escalating?"
                  aria-label="SOC AI question"
                />
                <button
                  type="button"
                  className="hi-ai__ask"
                  disabled={!aiPrompt.trim() || aiMutation.isPending}
                  onClick={() => aiMutation.mutate()}
                >
                  {aiMutation.isPending ? (
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} aria-hidden />
                  ) : (
                    <Brain size={16} aria-hidden />
                  )}
                  Ask SOC AI
                </button>

                {aiMutation.isError && (
                  <div className="hi-honesty hi-honesty--error" role="alert">
                    {formatSocAiHttpHonesty(aiMutation.error)}
                  </div>
                )}

                {aiMutation.isSuccess && aiMutation.data && (
                  <div className="hi-ai__result" role="region" aria-label="SOC AI answer">
                    {isSocAiUnavailableAnswer(aiMutation.data) ? (
                      <div className="hi-honesty hi-honesty--warn">
                        {aiMutation.data.answer}
                        <br />
                        Assistive SOC AI remains STAGING CANDIDATE until the service is configured.
                      </div>
                    ) : (
                      <>
                        <p className="hi-ai__answer">{aiMutation.data.answer}</p>
                        <div className="hi-ai__meta">
                          <span>
                            Confidence:{' '}
                            {Number.isFinite(aiMutation.data.confidence)
                              ? aiMutation.data.confidence.toFixed(2)
                              : '—'}
                          </span>
                          <span>
                            Sources:{' '}
                            {aiMutation.data.sources.length > 0
                              ? aiMutation.data.sources.join(', ')
                              : 'none returned'}
                          </span>
                          {aiMutation.data.durationMs > 0 && (
                            <span>{aiMutation.data.durationMs} ms</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
