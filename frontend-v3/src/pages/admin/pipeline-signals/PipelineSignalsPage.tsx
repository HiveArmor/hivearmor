/**
 * PipelineSignalsPage — Admin measured capacity/lag signals (SIEM-009).
 * No invented SLO pass/fail thresholds.
 */

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, Loader2 } from 'lucide-react';

import { HaButton } from '@/components/ha-button/HaButton';
import { apiClient } from '@/lib/apiClient';

export interface ConsumerGroupLag {
  group: string;
  totalLag: number | null;
}

export interface SoakHistoryPoint {
  recordedAt: string | null;
  opensearchStatus: string | null;
  opensearchStoreBytes: number | null;
  consumerLag: number | null;
  sampleFile: string | null;
}

export interface PipelineSignalsDTO {
  recordedAt: string;
  backendStatus: string;
  opensearchStatus: string | null;
  opensearchUnassignedShards: number | null;
  opensearchStoreBytes: number | null;
  postgresHivearmorBytes: number | null;
  consumerGroupLags: ConsumerGroupLag[];
  topics: string[];
  hostSamplePath: string | null;
  hostSampleRecordedAt: string | null;
  hostSampleStatus: string | null;
  soakHistory: SoakHistoryPoint[];
  soakSpanHours: number | null;
  soakSampleCount: number | null;
  limitations: string[];
}

function formatBytes(value: number | null): string {
  if (value === null || value === undefined) return 'Not reported';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function SignalRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '10px 0',
        borderBottom: '1px solid var(--ha-border)',
        fontSize: 'var(--ha-text-base)',
      }}
    >
      <span style={{ color: 'var(--ha-text-secondary)' }}>{label}</span>
      <strong style={{ color: 'var(--ha-text-primary)', fontFamily: 'var(--ha-font-mono)', fontWeight: 500 }}>
        {value}
      </strong>
    </div>
  );
}

export function PipelineSignalsPage(): JSX.Element {
  const query = useQuery({
    queryKey: ['ha-pipeline-signals'],
    queryFn: () => apiClient.get<PipelineSignalsDTO>('/ha-pipeline-signals'),
    refetchInterval: 60_000,
  });

  const data = query.data;
  const history = data?.soakHistory ?? [];

  return (
    <div style={{ padding: 24, color: 'var(--ha-text-primary)', maxWidth: 1100 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Activity size={18} style={{ color: 'var(--ha-primary)' }} />
            <h1 style={{ fontSize: 'var(--ha-text-md)', margin: 0, fontWeight: 600 }}>Pipeline signals</h1>
          </div>
          <p style={{ margin: 0, color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)', maxWidth: 720 }}>
            Measured OpenSearch, PostgreSQL, and host soak sampler values. HiveArmor does not invent SLO pass/fail
            thresholds on this board. Soak history is sampler files only — not a Grafana board.
          </p>
        </div>
        <HaButton variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>
          Refresh
        </HaButton>
      </header>

      {query.isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ha-text-secondary)' }}>
          <Loader2 size={16} />
          Loading signals…
        </div>
      )}

      {query.isError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 14px',
            border: '1px solid var(--ha-critical)',
            borderRadius: 'var(--ha-radius-base)',
            background: 'color-mix(in srgb, var(--ha-critical) 12%, transparent)',
          }}
        >
          <AlertCircle size={16} style={{ color: 'var(--ha-critical)' }} />
          <span>Failed to load pipeline signals. Platform Administrator access is required.</span>
        </div>
      )}

      {data && (
        <>
          <section
            style={{
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              padding: '8px 16px',
              marginBottom: 16,
            }}
          >
            <SignalRow label="Recorded at" value={data.recordedAt} />
            <SignalRow label="Backend" value={data.backendStatus || 'Not reported'} />
            <SignalRow label="OpenSearch status" value={data.opensearchStatus || 'Not reported'} />
            <SignalRow
              label="OpenSearch unassigned shards"
              value={data.opensearchUnassignedShards === null ? 'Not reported' : String(data.opensearchUnassignedShards)}
            />
            <SignalRow label="OpenSearch store size" value={formatBytes(data.opensearchStoreBytes)} />
            <SignalRow label="PostgreSQL (hivearmor) size" value={formatBytes(data.postgresHivearmorBytes)} />
            <SignalRow label="Host sample status" value={data.hostSampleStatus || 'Not reported'} />
            <SignalRow label="Host sample recorded at" value={data.hostSampleRecordedAt || 'Not reported'} />
            <SignalRow
              label="Soak sample count"
              value={data.soakSampleCount === null || data.soakSampleCount === undefined
                ? 'Not reported'
                : String(data.soakSampleCount)}
            />
            <SignalRow
              label="Soak span (hours)"
              value={data.soakSpanHours === null || data.soakSpanHours === undefined
                ? 'Not reported'
                : data.soakSpanHours.toFixed(3)}
            />
          </section>

          <section
            style={{
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              padding: 16,
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: 'var(--ha-text-base)', margin: '0 0 12px', fontWeight: 600 }}>Consumer group lag</h2>
            {data.consumerGroupLags.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>
                No host soak lag sample yet.
              </p>
            ) : (
              data.consumerGroupLags.map((row) => (
                <SignalRow
                  key={row.group}
                  label={row.group}
                  value={row.totalLag === null ? 'Not reported' : String(row.totalLag)}
                />
              ))
            )}
          </section>

          <section
            style={{
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              padding: 16,
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: 'var(--ha-text-base)', margin: '0 0 12px', fontWeight: 600 }}>
              Soak history (measured)
            </h2>
            {history.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>
                No soak samples yet. Hourly timer writes under the host soak directory.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 'var(--ha-text-sm)',
                    fontFamily: 'var(--ha-font-mono)',
                  }}
                >
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--ha-text-secondary)' }}>
                      <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--ha-border)' }}>Recorded</th>
                      <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--ha-border)' }}>OS</th>
                      <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--ha-border)' }}>Store</th>
                      <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--ha-border)' }}>Lag</th>
                      <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--ha-border)' }}>File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((row, index) => (
                      <tr key={row.sampleFile || row.recordedAt || `row-${index}`}>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--ha-border)' }}>
                          {row.recordedAt || '—'}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--ha-border)' }}>
                          {row.opensearchStatus || '—'}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--ha-border)' }}>
                          {formatBytes(row.opensearchStoreBytes)}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--ha-border)' }}>
                          {row.consumerLag === null || row.consumerLag === undefined ? '—' : String(row.consumerLag)}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--ha-border)' }}>
                          {row.sampleFile || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section
            style={{
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              padding: 16,
              marginBottom: 16,
            }}
          >
            <h2 style={{ fontSize: 'var(--ha-text-base)', margin: '0 0 12px', fontWeight: 600 }}>Topics (host sample)</h2>
            {data.topics.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>
                No topics in host sample.
              </p>
            ) : (
              <p style={{ margin: 0, fontFamily: 'var(--ha-font-mono)', fontSize: 'var(--ha-text-sm)' }}>
                {data.topics.join(', ')}
              </p>
            )}
          </section>

          <section
            style={{
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
              padding: 16,
              background: 'var(--ha-surface-raised)',
            }}
          >
            <h2 style={{ fontSize: 'var(--ha-text-base)', margin: '0 0 8px', fontWeight: 600 }}>Limitations</h2>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>
              {data.limitations.map((item) => (
                <li key={item} style={{ marginBottom: 4 }}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
