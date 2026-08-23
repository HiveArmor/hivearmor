/**
 * Detection Engineering UI capability gates (F10).
 * Enable only when HaDetectionRuleResource exposes an authorized endpoint.
 * Do not flip these without verifying @PreAuthorize on the matching backend mapping.
 */

/** DET-009: GET /ha-detection-rules/executions — authorized (ALERT_QUEUE_AUTH). */
export const DET_009_EXECUTIONS = true;

/**
 * DET-009: POST /ha-detection-rules/{id}/gap-fill — authorized (SOC_MANAGER_AUTH).
 * There is no separate gap-fill *preview* mapping; the UI runs gap-fill with confirmation.
 */
export const DET_009_GAP_FILL = true;

/** Execution-scoped alert pivot is not exposed by HaDetectionRuleResource. */
export const DET_009_ALERT_PIVOT = false;

/** DET-011: POST /ha-detection-rules/validate and /preview — authorized (ALERT_QUEUE_AUTH). */
export const DET_011_VALIDATE_PREVIEW = true;

/**
 * DET-014 available-content recommendations — no dedicated backend mapping.
 * DET-015 coverage includes inline recommendations; that is not DET-014.
 */
export const DET_014_AVAILABLE_CONTENT = false;

export const DET_009_GAP_FILL_DISABLED_TITLE =
  'Gap-fill requires Platform Administrator or SOC Manager';

export const DET_009_ALERT_PIVOT_DISABLED_TITLE =
  'Execution-scoped alert pivot is not available from the detection rules API';

export const DET_014_DISABLED_TITLE =
  'DET-014 available-content recommendations are not exposed by the backend';
