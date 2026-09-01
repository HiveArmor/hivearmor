/**
 * Identity & Tenancy — platform admin honesty (Prompt 36 / Wave C2 slice 1).
 *
 * Production inventory: GET /api/users, GET /api/ha-tenants, OIDC/SCIM status projections.
 * Invite, suspend, access reviews, and immutable identity audit remain fail-closed (IAM-001–IAM-010).
 */

import { useQuery } from '@tanstack/react-query';
import { CircleSlash2, UserCog } from 'lucide-react';
import { Link } from 'react-router-dom';

import './AdminUsersPage.css';
import { identityAdministrationService } from '../identity-administration/identityAdministration.service';
import type { IdentityAdministrationView } from '../identity-administration/identityAdministration.types';
import { IdentityAdministrationPage } from '../identity-administration/IdentityAdministrationPage';

import { ROUTES } from '@/constants/routes.constants';
import { useAuthStore } from '@/store/auth.store';

/** Bundle-visible job sentence — identity directory, not posture identities or governance audit. */
export const ADMIN_USERS_JOB_SENTENCE =
  'Identity & Tenancy — inventory authorized principals, tenant boundaries, and federation posture for platform administration. User directory reads GET /api/users; tenant inventory on Tenants; posture identity risk lives on Identities; immutable governance audit on Audit — invite, suspend, access reviews, and SCIM lifecycle mutations remain fail-closed until IAM contracts land.';

export function AdminUsersPage({
  initialView = 'directory',
}: {
  initialView?: IdentityAdministrationView;
}): JSX.Element {
  const { hasRole } = useAuthStore();
  const canAdminister = hasRole('ROLE_ADMIN');

  const inventoryQuery = useQuery({
    queryKey: ['identity-administration'],
    queryFn: ({ signal }) => identityAdministrationService.list(signal),
    enabled: canAdminister,
    staleTime: 30_000,
  });

  const inventory = inventoryQuery.data;
  const showEmptyHonesty =
    !inventoryQuery.isLoading &&
    !inventoryQuery.isError &&
    inventory !== undefined &&
    inventory.users.length === 0 &&
    inventory.tenants.length === 0 &&
    inventory.federation.length === 0;

  if (!canAdminister) {
    return (
      <section className="adm-users-page" aria-label="Identity and Tenancy">
        <header className="adm-users-header">
          <div className="adm-users-header__identity">
            <span className="adm-users-header__mark">
              <UserCog size={18} aria-hidden="true" />
            </span>
            <div className="adm-users-header__copy">
              <div className="adm-users-header__eyebrow">
                <span>IDENTITY &amp; TENANCY</span>
                <span className="adm-users-header__badge">STAGING CANDIDATE</span>
              </div>
              <h1>Identity &amp; Tenancy</h1>
              <p className="adm-users-header__job">{ADMIN_USERS_JOB_SENTENCE}</p>
            </div>
          </div>
        </header>
        <div className="adm-users-empty" role="status">
          <CircleSlash2 size={30} />
          <strong>Identity administration access restricted</strong>
          <span>
            Identity &amp; Tenancy requires Platform Administrator. Required permission:
            Platform Administrator.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="adm-users-page" aria-label="Identity and Tenancy">
      <header className="adm-users-header">
        <div className="adm-users-header__identity">
          <span className="adm-users-header__mark">
            <UserCog size={18} aria-hidden="true" />
          </span>
          <div className="adm-users-header__copy">
            <div className="adm-users-header__eyebrow">
              <span>IDENTITY &amp; TENANCY</span>
              <span className="adm-users-header__badge">STAGING CANDIDATE</span>
            </div>
            <h1>Identity &amp; Tenancy</h1>
            <p className="adm-users-header__job">{ADMIN_USERS_JOB_SENTENCE}</p>
            <p className="adm-users-page__projection-note" role="note">
              Directory via GET /api/users (page snapshot — tenant membership, MFA, and last sign-in
              may be unreported). Tenant inventory via GET /api/ha-tenants. Federation reads OIDC
              providers and SCIM token status only. Access reviews, invitations, suspend, and
              immutable identity audit are not authoritative — workflow actions remain disabled.
            </p>
          </div>
        </div>
      </header>

      <p className="adm-users-page__meta">
        <Link to={ROUTES.ADMIN_TENANTS}>Tenants</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.IDENTITIES}>Identities</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.ADMIN_AUDIT}>Audit</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.ADMIN_ENROLLMENT_AUDIT}>Enrollment audit</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.ADMIN_SETTINGS}>Settings</Link>
        <span aria-hidden="true">·</span>
        <span className="adm-users-page__access">Platform Administrator</span>
      </p>

      {showEmptyHonesty && (
        <div
          className="admin-users-empty-honesty"
          role="status"
          data-testid="admin-users-empty-honesty"
        >
          <strong>No principals or tenants in authorized inventory.</strong>
          <span>
            An empty directory does not imply identity health or successful federation. Configure
            OIDC/SCIM from Federation, or open Tenants for tenant boundaries — invite and suspend
            remain fail-closed.
          </span>
          <span className="admin-users-empty-honesty__links">
            <Link to={ROUTES.ADMIN_TENANTS}>Open Tenants</Link>
            <Link to={ROUTES.IDENTITIES}>Open Identities</Link>
          </span>
        </div>
      )}

      <div className="adm-users-page__body">
        <IdentityAdministrationPage initialView={initialView} />
      </div>
    </section>
  );
}
