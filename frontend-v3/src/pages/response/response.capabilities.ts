/**
 * Wave A3 Defend/respond capability gates (STAGING CANDIDATE honesty).
 * Flip full governance only after HaResponseGovernance policy/delegation CRUD exists.
 * RESP_020_APPROVAL_PROJECTION may be true while RESP_020_GOVERNANCE stays false.
 */

/**
 * RESP-018: GET /ha-playbooks/executions, /executions/summary, /executions/{id}/trace.
 * Inventory projects hive_playbook_execution; trace is best-effort from steps_log.
 */
export const RESP_018_EXECUTION_INVENTORY = true;

/**
 * Compatibility ledger: GET /api/soar/audit (UtmSoarPlaybookResource).
 * Kept as fallback when RESP_018_EXECUTION_INVENTORY is false.
 */
export const RESP_018_SOAR_AUDIT_PROJECTION = true;

/**
 * RESP-020 full governance (policies + delegations + authoritative ledger).
 * Keep false until HaResponseGovernance policy/delegation CRUD exists.
 */
export const RESP_020_GOVERNANCE = false;

/**
 * RESP-020 STAGING CANDIDATE — approval queue compatibility projection.
 * GET /ha-response-governance/approvals projects hive_playbook_execution
 * awaiting_approval (+ recent approval decisions). Policies/delegations stay empty.
 * Decision bridges to playbook approve/reject (ADMIN-only).
 */
export const RESP_020_APPROVAL_PROJECTION = true;

/**
 * GET /ha-playbooks/{id}/audit — not mapped; history is GET /{id}/history only.
 * When false, Audit tab projects from history (honest labeling).
 */
export const RESP_PLAYBOOK_AUDIT = false;

export const RESP_018_DISABLED_TITLE =
  'Playbook execution inventory is not available from the backend yet';

export const RESP_018_SOAR_AUDIT_TITLE =
  'Showing SOAR audit projection from GET /api/soar/audit — not the full RESP-018 execution inventory';

export const RESP_018_INVENTORY_TITLE =
  'Showing RESP-018 execution inventory from GET /api/ha-playbooks/executions (+ summary/trace)';

export const RESP_020_DISABLED_TITLE =
  'Response governance APIs are not available from the backend yet';

export const RESP_020_APPROVAL_PROJECTION_TITLE =
  'Showing playbook approval projection from GET /api/ha-response-governance/approvals — policies and delegations are not implemented';

export const RESP_PLAYBOOK_AUDIT_DISABLED_TITLE =
  'Dedicated playbook audit endpoint is not available; showing execution history projection';

export const AUTHORITY_DECIDE_DENIED_TITLE = 'Required permission: Platform Administrator';
