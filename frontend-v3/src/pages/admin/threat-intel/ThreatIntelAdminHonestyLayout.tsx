import type { ReactNode } from 'react';

import { Brain, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import './ThreatIntelAdminPage.css';
import {
  THREAT_INTEL_ADMIN_JOB_SENTENCE,
  THREAT_INTEL_LEGACY_V1_CUTOVER_COMPLETE,
  THREAT_INTEL_SCHEDULED_SYNC_FAIL_CLOSED_TITLE,
} from './threatIntelAdmin.honesty';

import { StatusDock } from '@/components/status-dock';
import { ROUTES } from '@/constants/routes.constants';
import { useEpsStream } from '@/hooks/useEpsStream';
import { TI_004_SYNC_RECEIPT } from '@/services/threatIntel.capabilities';

const THREAT_INTEL_PROJECTION_NOTE =
  'Feed inventory via GET /api/ha-threat-intel/taxii-feeds and /misp-feeds; IOC stats via GET /api/ha-threat-intel/stats. Manual Sync Now returns ThreatFeedSyncReceipt when TI-004 is enabled — zero-IOC success is never inferred. Legacy /api/v1/threat-intel is hardened but deprecation headers are not claimed until cutover completes.';

function ThreatIntelMetaLinks(): JSX.Element {
  return (
    <p className="ti-page__meta">
      <Link to={ROUTES.INTELLIGENCE}>Hive Intelligence</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_AUDIT}>Audit</Link>
      <span aria-hidden="true">·</span>
      <Link to={ROUTES.ADMIN_INTEGRATIONS}>Integrations</Link>
      <span aria-hidden="true">·</span>
      <Link to="/admin/retention">Retention</Link>
      <span aria-hidden="true">·</span>
      <span className="ti-page__access">Platform Administrator</span>
    </p>
  );
}

function ThreatIntelHonestyHeader(): JSX.Element {
  return (
    <header className="ti-header">
      <div className="ti-header__identity">
        <span className="ti-header__mark">
          <Brain size={18} aria-hidden="true" />
        </span>
        <div className="ti-header__copy">
          <div className="ti-header__eyebrow">
            <span>ADMINISTRATION · THREAT INTEL SOURCES</span>
            <span className="ti-header__badge">STAGING CANDIDATE</span>
          </div>
          <h1>Threat Intelligence</h1>
          <p className="ti-header__job">{THREAT_INTEL_ADMIN_JOB_SENTENCE}</p>
        </div>
      </div>
    </header>
  );
}

export function ThreatIntelAdminHonestyLayout({
  children,
  showFeedsEmptyHonesty,
  lastUpdated,
}: {
  children: ReactNode;
  showFeedsEmptyHonesty: boolean;
  lastUpdated?: number;
}): JSX.Element {
  const eps = useEpsStream();

  return (
    <section className="ti-page" aria-label="Threat Intelligence" data-threat-intel-honesty="true">
      <ThreatIntelHonestyHeader />
      <ThreatIntelMetaLinks />
      <p className="ti-page__projection-note" role="note">
        {THREAT_INTEL_PROJECTION_NOTE}
        {!THREAT_INTEL_LEGACY_V1_CUTOVER_COMPLETE &&
          ' Legacy /v1/threat-intel cutover headers remain contract-pending (TI-003).'}
      </p>
      <div
        className="ti-trust"
        role="note"
        data-testid="threat-intel-scheduled-sync-fail-closed-banner"
        title={THREAT_INTEL_SCHEDULED_SYNC_FAIL_CLOSED_TITLE}
      >
        <ShieldCheck size={13} aria-hidden="true" />
        <strong>Scheduled sync fail-closed:</strong>
        <span>
          Background feed sync jobs and TLP propagation to correlated findings remain unavailable
          until TI contracts land.
          {TI_004_SYNC_RECEIPT &&
            ' Manual Sync Now surfaces ThreatFeedSyncReceipt — zero-IOC success is never inferred.'}
        </span>
      </div>
      {showFeedsEmptyHonesty && (
        <div
          className="threat-intel-empty-honesty"
          role="status"
          data-testid="threat-intel-empty-honesty"
        >
          <strong>No TAXII or MISP feeds in authorized inventory.</strong>
          <span>
            An empty feed list is not an error — it means no feed metadata is configured yet. IOC
            stats may still load from GET /api/ha-threat-intel/stats; analyst lookup lives on Hive
            Intelligence. Scheduled sync and governed IOC lifecycle automation remain
            contract-pending.
          </span>
        </div>
      )}
      <div className="ti-body">{children}</div>
      <StatusDock
        className="ti-status-dock"
        sseConnected={eps.connected}
        eps={eps.eps}
        mode="historical"
        lastUpdated={lastUpdated ? new Date(lastUpdated) : undefined}
      />
    </section>
  );
}
