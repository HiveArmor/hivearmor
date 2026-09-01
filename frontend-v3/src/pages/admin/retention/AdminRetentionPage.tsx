/**
 * Admin retention — data lifecycle governance honesty hub (Wave C2 / Prompt 44 leftovers).
 *
 * Production inventory: GET /api/ha-retention-policies (ADMIN-gated).
 * Legal holds, impact preview and versioned change proposals remain fail-closed (GOV-005).
 */

import { ADMIN_RETENTION_JOB_SENTENCE } from './adminRetention.honesty';
import { GovernanceOperationsPage } from '../governance-operations/GovernanceOperationsPage';

export function AdminRetentionPage(): JSX.Element {
  return (
    <GovernanceOperationsPage
      initialView="retention"
      honestyChrome={{ jobSentence: ADMIN_RETENTION_JOB_SENTENCE }}
    />
  );
}
