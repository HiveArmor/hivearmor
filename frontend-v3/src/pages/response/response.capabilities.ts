/**
 * Wave A3 Defend/respond capability gates (STAGING CANDIDATE honesty).
 * Flip only after PlaybookResource / HaResponseGovernance expose secured mappings.
 */

/**
 * RESP-018: GET /ha-playbooks/executions, /executions/summary, /executions/{id}/trace.
 * PlaybookResource today has approve/reject/cancel/stream only — no inventory list.
 */
export const RESP_018_EXECUTION_INVENTORY = false;

/**
 * Compatibility ledger: GET /api/soar/audit (UtmSoarPlaybookResource).
 * Not full RESP-018 inventory/summary/trace — labeled as SOAR audit projection.
 */
export const RESP_018_SOAR_AUDIT_PROJECTION = true;

/**
 * RESP-020: /ha-response-governance/** approvals, policies, delegations.
 * No HaResponseGovernance resource exists in backend.
 */
export const RESP_020_GOVERNANCE = false;

/**
 * GET /ha-playbooks/{id}/audit — not mapped; history is GET /{id}/history only.
 * When false, Audit tab projects from history (honest labeling).
 */
export const RESP_PLAYBOOK_AUDIT = false;

export const RESP_018_DISABLED_TITLE =
  'Playbook execution inventory is not available from the backend yet';

export const RESP_018_SOAR_AUDIT_TITLE =
  'Showing SOAR audit projection from GET /api/soar/audit — not the full RESP-018 execution inventory';

export const RESP_020_DISABLED_TITLE =
  'Response governance APIs are not available from the backend yet';

export const RESP_PLAYBOOK_AUDIT_DISABLED_TITLE =
  'Dedicated playbook audit endpoint is not available; showing execution history projection';
