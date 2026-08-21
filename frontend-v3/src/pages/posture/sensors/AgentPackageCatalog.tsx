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

/**
 * Agent installer catalog. Labels are static; availability comes from
 * GET /api/ha-agent-packages. Downloads are GET /agent-packages/{filename}.
 */
export function AgentPackageCatalog(): JSX.Element {
  const catalogQuery = useQuery({
    queryKey: ['ha-agent-packages'],
    queryFn: () => apiClient.get<AgentPackageStatus[]>('/ha-agent-packages'),
    retry: false,
    staleTime: 30_000,
  });

  return (
    <section className="agent-package-catalog" aria-labelledby="agent-package-heading">
      <header className="agent-package-catalog__header">
        <div>
          <h2 id="agent-package-heading">Agent packages</h2>
          <p>
            Download the installer binary for the endpoint OS, then run Add Agent to generate a
            keyed install script. Packages do not include a connection key. Unpublished binaries
            stay listed until they are copied into the agent package directories.
          </p>
        </div>
      </header>
      <ul className="agent-package-catalog__grid">
        {AGENT_PACKAGES.map((pkg) => {
          const status = catalogQuery.data?.find((item) => item.filename === pkg.filename);
          const unpublished = catalogQuery.data !== undefined && status?.available === false;
          return (
            <li key={pkg.id}>
              <a
                className={unpublished ? 'agent-package-card agent-package-card--unpublished' : 'agent-package-card'}
                href={pkg.href}
                download={pkg.filename}
              >
                <span className="agent-package-card__meta">
                  <strong>{pkg.platform}</strong>
                  <span>{pkg.arch}</span>
                </span>
                <span className="agent-package-card__file">{pkg.filename}</span>
                <span className="agent-package-card__action">
                  <Download size={14} aria-hidden="true" />
                  {unpublished ? 'Not published' : 'Download'}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
