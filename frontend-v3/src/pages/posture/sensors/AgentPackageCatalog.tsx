import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';

import { AGENT_PACKAGES } from './agentPackages';

import { apiClient } from '@/lib/apiClient';

import './AgentPackageCatalog.css';

interface AgentPackageStatus {
  filename: string;
  href: string;
  available: boolean;
  sizeBytes: number | null;
}

function formatBytes(sizeBytes: number | null | undefined): string | null {
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return null;
  }
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Optional offline package catalog. The Add Agent install script downloads the
 * matching binary itself — use these cards for air-gapped hosts or manual install.
 * Availability comes from GET /api/ha-agent-packages.
 */
export function AgentPackageCatalog(): JSX.Element {
  const catalogQuery = useQuery({
    queryKey: ['ha-agent-packages'],
    queryFn: () => apiClient.get<AgentPackageStatus[]>('/ha-agent-packages'),
    retry: false,
    staleTime: 30_000,
  });

  const catalogError = catalogQuery.isError;
  const catalogLoaded = catalogQuery.data !== undefined;
  const publishedCount = catalogQuery.data?.filter((item) => item.available).length ?? 0;
  const nonePublished = catalogLoaded && !catalogError && publishedCount === 0;

  return (
    <section className="agent-package-catalog" aria-labelledby="agent-package-heading">
      <header className="agent-package-catalog__header">
        <div>
          <h2 id="agent-package-heading">Optional package downloads</h2>
          <p>
            Prefer <strong>Add Agent</strong> first — the generated install script downloads the
            correct binary automatically. Use these cards only for air-gapped endpoints or when the
            script download fails. Packages never include a connection key.
          </p>
          {catalogError && (
            <p className="agent-package-catalog__notice" role="status">
              Package availability could not be loaded. Download links may fail until{' '}
              <code>GET /api/ha-agent-packages</code> succeeds.
            </p>
          )}
          {nonePublished && (
            <p className="agent-package-catalog__notice agent-package-catalog__notice--warn" role="alert">
              No agent binaries are published on this server yet (
              <code>/agent-packages/</code>). Install scripts will fail to download until packages
              are copied into the agent package directories on the host.
            </p>
          )}
        </div>
      </header>
      <ul className="agent-package-catalog__grid">
        {AGENT_PACKAGES.map((pkg) => {
          const status = catalogQuery.data?.find((item) => item.filename === pkg.filename);
          const available = status?.available === true;
          const unpublished = catalogLoaded && !available;
          const sizeLabel = formatBytes(status?.sizeBytes ?? null);
          const href = status?.href?.trim() || pkg.href;

          if (unpublished || catalogQuery.isLoading) {
            return (
              <li key={pkg.id}>
                <div
                  className={
                    unpublished
                      ? 'agent-package-card agent-package-card--unpublished'
                      : 'agent-package-card agent-package-card--pending'
                  }
                  aria-disabled="true"
                >
                  <span className="agent-package-card__meta">
                    <strong>{pkg.platform}</strong>
                    <span>{pkg.arch}</span>
                  </span>
                  <span className="agent-package-card__file">{pkg.filename}</span>
                  <span className="agent-package-card__action">
                    <Download size={14} aria-hidden="true" />
                    {catalogQuery.isLoading ? 'Checking…' : 'Not published'}
                  </span>
                </div>
              </li>
            );
          }

          return (
            <li key={pkg.id}>
              <a className="agent-package-card" href={href} download={pkg.filename}>
                <span className="agent-package-card__meta">
                  <strong>{pkg.platform}</strong>
                  <span>
                    {pkg.arch}
                    {sizeLabel ? ` · ${sizeLabel}` : ''}
                  </span>
                </span>
                <span className="agent-package-card__file">{pkg.filename}</span>
                <span className="agent-package-card__action">
                  <Download size={14} aria-hidden="true" />
                  Download
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
