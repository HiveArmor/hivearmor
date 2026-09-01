/**
 * Platform Settings — governance configuration honesty (Prompt 43 / Wave C2 slice 2).
 *
 * Production reads: GET /api/ha-admin/settings (masked aggregate).
 * Versioned change control, approval, rollout and legacy /ha-settings migration remain fail-closed (GOV-007–GOV-010).
 */

import { useQuery } from '@tanstack/react-query';
import { CircleSlash2, Settings2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import './AdminSettingsPage.css';
import {
  ADMIN_SETTINGS_JOB_SENTENCE,
  ADMIN_SETTINGS_PROPOSE_FAIL_CLOSED_TITLE,
} from './adminSettings.honesty';
import { governanceOperationsService } from '../governance-operations/governanceOperations.service';
import { GovernanceOperationsPage } from '../governance-operations/GovernanceOperationsPage';

import { ROUTES } from '@/constants/routes.constants';
import { useAuthStore } from '@/store/auth.store';

export function AdminSettingsPage(): JSX.Element {
  const { hasRole } = useAuthStore();
  const canAdminister = hasRole('ROLE_ADMIN');

  const inventoryQuery = useQuery({
    queryKey: ['governance-operations'],
    queryFn: ({ signal }) => governanceOperationsService.list(signal),
    enabled: canAdminister,
    staleTime: 30_000,
  });

  const inventory = inventoryQuery.data;
  const showEmptyHonesty =
    !inventoryQuery.isLoading &&
    !inventoryQuery.isError &&
    inventory !== undefined &&
    inventory.settings === null &&
    !governanceOperationsService.fixtureMode;

  if (!canAdminister) {
    return (
      <section
        className="adm-settings-page"
        aria-label="Platform Settings"
        data-admin-settings-honesty="true"
      >
        <header className="adm-settings-header">
          <div className="adm-settings-header__identity">
            <span className="adm-settings-header__mark">
              <Settings2 size={18} aria-hidden="true" />
            </span>
            <div className="adm-settings-header__copy">
              <div className="adm-settings-header__eyebrow">
                <span>PLATFORM SETTINGS</span>
                <span className="adm-settings-header__badge">STAGING CANDIDATE</span>
              </div>
              <h1>Platform Settings</h1>
              <p className="adm-settings-header__job">{ADMIN_SETTINGS_JOB_SENTENCE}</p>
            </div>
          </div>
        </header>
        <div className="adm-settings-empty" role="status">
          <CircleSlash2 size={30} />
          <strong>Platform settings access restricted</strong>
          <span>
            Platform Settings requires Platform Administrator. Required permission: Platform
            Administrator.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section
      className="adm-settings-page"
      aria-label="Platform Settings"
      data-admin-settings-honesty="true"
    >
      <header className="adm-settings-header">
        <div className="adm-settings-header__identity">
          <span className="adm-settings-header__mark">
            <Settings2 size={18} aria-hidden="true" />
          </span>
          <div className="adm-settings-header__copy">
            <div className="adm-settings-header__eyebrow">
              <span>PLATFORM SETTINGS</span>
              <span className="adm-settings-header__badge">STAGING CANDIDATE</span>
            </div>
            <h1>Platform Settings</h1>
            <p className="adm-settings-header__job">{ADMIN_SETTINGS_JOB_SENTENCE}</p>
            <p className="adm-settings-page__projection-note" role="note">
              Effective configuration via GET /api/ha-admin/settings — secrets are masked and
              write-only. The live contract applies section updates immediately without version,
              dry-run diff, approval, rollout receipt or drift reporting (GOV-007). Legacy
              /ha-settings overlap is recorded for migration but not marked deprecated until
              successor lifecycle headers land (GOV-008).
            </p>
          </div>
        </div>
      </header>

      <p className="adm-settings-page__meta">
        <Link to={ROUTES.ADMIN_AUDIT}>Audit</Link>
        <span aria-hidden="true">·</span>
        <Link to="/admin/retention">Retention</Link>
        <span aria-hidden="true">·</span>
        <Link to="/settings/system">System settings</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.SETTINGS_API_KEYS}>API Keys</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.ADMIN_INTEGRATIONS}>Integrations</Link>
        <span aria-hidden="true">·</span>
        <span className="adm-settings-page__access">Platform Administrator</span>
      </p>

      {showEmptyHonesty && (
        <div
          className="admin-settings-empty-honesty"
          role="status"
          data-testid="admin-settings-empty-honesty"
        >
          <strong>Secret-safe configuration is unavailable.</strong>
          <span>
            GET /api/ha-admin/settings did not return a masked aggregate — this is not proof that
            defaults are applied. Audit and retention projections may still load from sibling
            endpoints. Propose/apply workflows remain disabled.
          </span>
          <span className="admin-settings-empty-honesty__links">
            <Link to={ROUTES.ADMIN_AUDIT}>Open Audit</Link>
            <Link to="/admin/retention">Open Retention</Link>
          </span>
        </div>
      )}

      {!governanceOperationsService.fixtureMode && (
        <div
          className="adm-settings-trust"
          role="note"
          data-testid="admin-settings-propose-fail-closed-banner"
          title={ADMIN_SETTINGS_PROPOSE_FAIL_CLOSED_TITLE}
        >
          <ShieldCheck size={13} aria-hidden="true" />
          <strong>Propose fail-closed:</strong>
          <span>
            Configuration changes require versioned drafts, impact preview and approval — direct
            apply is not offered from this workspace until GOV-007 lands.
          </span>
        </div>
      )}

      <div className="adm-settings-page__body">
        <GovernanceOperationsPage initialView="configuration" />
      </div>
    </section>
  );
}
