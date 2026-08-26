/**
 * SensorGrid remote-action capability gates (GAP-SEC-05 / F03 follow-up).
 *
 * Trust boundary (engineering notes — do not surface INTERNAL_KEY / API paths in UI):
 * - Browser → JWT → Spring @PreAuthorize(ROLE_ADMIN | ROLE_SOC_MANAGER) on
 *   POST /api/edr/isolation and POST /api/edr/actions/kill-process
 * - Backend → INTERNAL_KEY → agent-manager PanelService.ProcessCommand
 * - Agent stream executes EDR_ISOLATE / EDR_KILL (see agent/agent/edr_handler.go)
 *
 * Kill and isolate are gated independently — do not enable isolate until a live
 * ProcessCommand isolation round-trip is proven (B1-SENS-02).
 */

/** REST mutate endpoints carry @PreAuthorize(ROLE_ADMIN | ROLE_SOC_MANAGER). */
export const REMOTE_SENSOR_ACTIONS_REST_GATED = true;

/**
 * Kill-process live agent execution verified.
 * STAGING CANDIDATE (2026-08-24): kill-process → agent 19 (EC2AMAZ-8F0Q7DL)
 * notepad PID round-trip proven (HTTP 200 + PID gone).
 * Not PRODUCTION READY — env-specific proof only.
 */
export const REMOTE_SENSOR_KILL_LIVE_VERIFIED = true;

/**
 * Host isolation live agent execution — not proven; keep fail-closed.
 * Comments previously noted isolation “not used” while a shared LIVE_VERIFIED
 * flag incorrectly enabled Isolate alongside Kill (B1-SENS-02).
 */
export const REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED = false;

/**
 * @deprecated Prefer {@link REMOTE_SENSOR_KILL_LIVE_VERIFIED} /
 * {@link REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED}. True only when both are verified.
 */
export const REMOTE_SENSOR_ACTIONS_LIVE_VERIFIED =
  REMOTE_SENSOR_KILL_LIVE_VERIFIED && REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED;

/** Roles matching EdrResource MUTATE_AUTH. */
export const REMOTE_SENSOR_ACTION_ROLES = ['ROLE_ADMIN', 'ROLE_SOC_MANAGER'] as const;

export function canEnableKillProcess(): boolean {
  return REMOTE_SENSOR_ACTIONS_REST_GATED && REMOTE_SENSOR_KILL_LIVE_VERIFIED;
}

export function canEnableIsolateHost(): boolean {
  return REMOTE_SENSOR_ACTIONS_REST_GATED && REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED;
}

/** True when any remote mutate path is live-verified (kill and/or isolate). */
export function canEnableRemoteSensorActions(): boolean {
  return canEnableKillProcess() || canEnableIsolateHost();
}

/** Operator-facing copy — no API paths, INTERNAL_KEY, or ProcessCommand jargon. */
export const REMOTE_SENSOR_ACTIONS_BLOCKED_TITLE =
  'Remote sensor actions are not available yet';

export const REMOTE_SENSOR_ISOLATE_BLOCKED_TITLE =
  'Host isolation is not available yet';

export const REMOTE_SENSOR_ACTIONS_BLOCKED_DESCRIPTION =
  'Kill process and host isolation require Platform Administrator or SOC Manager. Kill process is available on verified agents; host isolation stays disabled until it is verified end-to-end. Restart, push config, and collect logs are not available from this grid yet.';

/** Compact note when only isolate is still blocked (kill already works). */
export const REMOTE_SENSOR_ISOLATE_ONLY_DESCRIPTION =
  'Isolate stays disabled until it is verified end-to-end. Kill process remains available for Platform Administrator and SOC Manager. Restart is not available from this grid.';

export const REMOTE_SENSOR_ISOLATE_BANNER_DISMISS_KEY = 'ha_sensors_isolate_banner_dismissed';
