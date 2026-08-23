/**
 * SensorGrid remote-action capability gates (GAP-SEC-05 / F03 follow-up).
 *
 * Trust boundary (honest model):
 * - Browser → JWT → Spring @PreAuthorize(ROLE_ADMIN | ROLE_SOC_MANAGER) on
 *   POST /api/edr/isolation and POST /api/edr/actions/kill-process
 * - Backend → INTERNAL_KEY → agent-manager PanelService.ProcessCommand
 * - Agent stream executes EDR_ISOLATE / EDR_KILL (see agent/agent/edr_handler.go)
 *
 * INTERNAL_KEY must never reach the browser. ROLE_* belongs on the REST hop;
 * gRPC uses service identity only. That is intentional — not a remaining role gap.
 *
 * Flip {@link REMOTE_SENSOR_ACTIONS_LIVE_VERIFIED} to true only after a live
 * ProcessCommand → connected agent round-trip is proven in the target env.
 */

/** REST mutate endpoints carry @PreAuthorize(ROLE_ADMIN | ROLE_SOC_MANAGER). */
export const REMOTE_SENSOR_ACTIONS_REST_GATED = true;

/**
 * Live agent execution verified for ProcessCommand.
 * Keep false until isolate/kill is confirmed against a connected agent stream.
 */
export const REMOTE_SENSOR_ACTIONS_LIVE_VERIFIED = false;

/** Roles matching EdrResource MUTATE_AUTH. */
export const REMOTE_SENSOR_ACTION_ROLES = ['ROLE_ADMIN', 'ROLE_SOC_MANAGER'] as const;

export function canEnableRemoteSensorActions(): boolean {
  return REMOTE_SENSOR_ACTIONS_REST_GATED && REMOTE_SENSOR_ACTIONS_LIVE_VERIFIED;
}

export const REMOTE_SENSOR_ACTIONS_BLOCKED_TITLE =
  'Remote sensor actions stay blocked until ProcessCommand → agent is live-verified (GAP-SEC-05)';

export const REMOTE_SENSOR_ACTIONS_BLOCKED_DESCRIPTION =
  'JWT-authenticated REST mutates (/api/edr/isolation, /api/edr/actions/kill-process) are role-gated (Platform Administrator or SOC Manager) and dispatch PanelService.ProcessCommand server-side via INTERNAL_KEY. Buttons stay disabled until a connected agent round-trip is proven — flip REMOTE_SENSOR_ACTIONS_LIVE_VERIFIED when verified. Restart / Push Config / Collect Logs have no agent ProcessCommand handlers.';
