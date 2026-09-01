/**
 * Agent provisioning types — mirrors HaAgentKeyDTO from the Java backend.
 */

export type AgentMode = 'log' | 'edr';
export type AgentKeyStatus = 'active' | 'expired' | 'revoked';

/**
 * Request body for POST /api/ha-agent-keys.
 */
export interface CreateAgentKeyRequest {
  /** DNS-label compatible alias (e.g. "web-server-01"). */
  alias: string;
  /** Installation mode: "log" for log-only, "edr" for full endpoint telemetry. */
  mode: AgentMode;
  /** Hours until the provisioning key expires (1–168). Default: 24. */
  expiresIn: number;
}

/**
 * Full response from POST /api/ha-agent-keys.
 * The `key`, `bashScript`, and `powershellScript` fields are ONLY present here
 * and are never returned again — treat them as secrets.
 */
export interface AgentKeyCreatedDTO {
  /** Opaque database ID — used for DELETE operations. */
  id: string;
  /** Human-readable machine alias chosen by the admin. */
  alias: string;
  /**
   * One-time enrollment token. Present only in POST response.
   * Treat like a password — do not log or persist.
   */
  key: string;
  /** ISO-8601 expiry timestamp. */
  expiresAt: string;
  /** Installation mode: "log" or "edr". */
  mode: AgentMode;
  /** Executable bash script for Linux and macOS. Only in POST response. */
  bashScript: string;
  /** Executable PowerShell script for Windows. Only in POST response. */
  powershellScript: string;
  /** Hostname of the HiveArmor server embedded in the scripts. */
  serverHost: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** "active" or "expired". */
  status: AgentKeyStatus;
}

/**
 * List item from GET /api/ha-agent-keys.
 * Does NOT include key, bashScript, or powershellScript.
 */
export interface AgentKeyListItemDTO {
  id: string;
  alias: string;
  mode: AgentMode | null;
  expiresAt: string | null;
  createdAt: string;
  status: AgentKeyStatus;
}
