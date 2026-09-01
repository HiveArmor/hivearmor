/**
 * Admin audit — governance evidence honesty hub (Prompt 42 / Wave C2 slice 2).
 *
 * Production inventory: GET /api/ha-audit-log, GET /api/ha-audit-log/export (ADMIN-only).
 * Change control, legal holds and integrity proofs remain fail-closed (GOV-001–GOV-010).
 */

import { useSearchParams } from 'react-router-dom';

import { ADMIN_AUDIT_JOB_SENTENCE } from './adminAudit.honesty';
import type { GovernanceView } from '../governance-operations/governanceOperations.types';
import { GovernanceOperationsPage } from '../governance-operations/GovernanceOperationsPage';

function resolveInitialView(requested: string | null): GovernanceView {
  if (requested === 'changes' || requested === 'lifecycle' || requested === 'retention' || requested === 'configuration') {
    return requested;
  }
  return 'audit';
}

export function AdminAuditPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const initialView = resolveInitialView(searchParams.get('view'));
  return (
    <GovernanceOperationsPage
      initialView={initialView}
      honestyChrome={{ jobSentence: ADMIN_AUDIT_JOB_SENTENCE }}
    />
  );
}
