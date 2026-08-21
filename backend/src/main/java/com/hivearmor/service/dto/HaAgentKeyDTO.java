package com.hivearmor.service.dto;

import java.time.Instant;

/**
 * DTO returned by POST /api/ha-agent-keys.
 *
 * <p>The {@code key} field contains the raw connection key and is returned
 * <strong>only once</strong> at creation time. It is never stored in plaintext
 * after this point and will never be returned again by the GET endpoint.
 *
 * <p>The {@code bashScript} and {@code powershellScript} fields contain
 * complete, copy-pasteable install scripts that embed the key, server address,
 * and installation mode. The admin copies one of these and runs it directly
 * on the target machine — no further configuration required.
 *
 * <p>Constraints: No Lombok. All accessors are explicit public methods.
 */
public class HaAgentKeyDTO {

    /** Database primary key (opaque ID for delete operations). */
    private String id;

    /**
     * Human-readable alias given to the target machine (e.g. "web-server-01").
     * Unique per admin user. DNS-label compatible (alphanumeric + hyphens, max 63 chars).
     */
    private String alias;

    /**
     * Raw connection key — only present in the POST response.
     * Never returned by GET; null/absent in list responses.
     */
    private String key;

    /** Key expiry timestamp. RegisterAgent() rejects keys past this time. */
    private Instant expiresAt;

    /**
     * Installation mode chosen at provisioning time.
     * Either "log" (log collection only) or "edr" (full endpoint telemetry).
     */
    private String mode;

    /**
     * Ready-to-run bash script for Linux and macOS.
     * Auto-detects OS and CPU architecture, downloads the correct binary,
     * and runs the install command. Only present in POST response.
     */
    private String bashScript;

    /**
     * Ready-to-run PowerShell script for Windows.
     * Detects architecture, downloads the correct .exe, and installs.
     * Only present in POST response.
     */
    private String powershellScript;

    /**
     * Hostname of the HiveArmor server embedded in the generated scripts.
     * Included so the frontend can display it in the UI (e.g. "Required ports open to X").
     */
    private String serverHost;

    /** ISO-8601 creation timestamp. */
    private Instant createdAt;

    /** Key status: "active" or "expired". */
    private String status;

    // ---- Getters ----

    public String getId() { return id; }
    public String getAlias() { return alias; }
    public String getKey() { return key; }
    public Instant getExpiresAt() { return expiresAt; }
    public String getMode() { return mode; }
    public String getBashScript() { return bashScript; }
    public String getPowershellScript() { return powershellScript; }
    public String getServerHost() { return serverHost; }
    public Instant getCreatedAt() { return createdAt; }
    public String getStatus() { return status; }

    // ---- Setters ----

    public void setId(String id) { this.id = id; }
    public void setAlias(String alias) { this.alias = alias; }
    public void setKey(String key) { this.key = key; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public void setMode(String mode) { this.mode = mode; }
    public void setBashScript(String bashScript) { this.bashScript = bashScript; }
    public void setPowershellScript(String powershellScript) { this.powershellScript = powershellScript; }
    public void setServerHost(String serverHost) { this.serverHost = serverHost; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public void setStatus(String status) { this.status = status; }
}
