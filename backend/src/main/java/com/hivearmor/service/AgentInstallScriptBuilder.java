package com.hivearmor.service;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Builds the bash and PowerShell auto-install scripts that are returned by
 * the POST /api/ha-agent-keys endpoint.
 *
 * <p>The server hostname is derived from the incoming HTTP request so that the
 * scripts always contain the correct address regardless of whether the admin is
 * accessing HiveArmor directly, through a reverse proxy, or via a custom domain.
 *
 * <p>Priority order for hostname resolution:
 * <ol>
 *   <li>{@code X-Forwarded-Host} header (set by load-balancers / reverse proxies)</li>
 *   <li>{@code Host} header</li>
 *   <li>{@code request.getServerName()} (servlet container fallback)</li>
 * </ol>
 *
 * <p>Constraints: No Lombok. All methods are explicit. No static state.
 */
@Service
public class AgentInstallScriptBuilder {

    private static final Logger log = LoggerFactory.getLogger(AgentInstallScriptBuilder.class);
    private static final String CLASSNAME = "AgentInstallScriptBuilder";

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Resolves the HiveArmor server hostname from the current HTTP request context.
     * Returns "localhost" as a safe fallback when called outside a request context.
     */
    public String resolveServerHost() {
        try {
            ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.currentRequestAttributes();
            HttpServletRequest request = attrs.getRequest();

            // Prefer X-Forwarded-Host for reverse-proxy environments.
            String forwardedHost = request.getHeader("X-Forwarded-Host");
            if (forwardedHost != null && !forwardedHost.isBlank()) {
                // X-Forwarded-Host may contain a comma-separated list; take the first.
                return forwardedHost.split(",")[0].trim();
            }

            // Fall back to Host header (includes port if non-standard).
            String host = request.getHeader("Host");
            if (host != null && !host.isBlank()) {
                return host;
            }

            // Final fallback: servlet container server name.
            return request.getServerName();
        } catch (IllegalStateException e) {
            // Called outside a request context (e.g. during tests).
            log.debug("{}.resolveServerHost: no request context, using localhost", CLASSNAME);
            return "localhost";
        }
    }

    /**
     * Builds a bash script for Linux and macOS that:
     * <ol>
     *   <li>Auto-detects OS (linux / darwin) and CPU architecture (amd64 / arm64)</li>
     *   <li>Downloads the correct agent binary from {@code /agent-packages/} on HTTPS 443</li>
     *   <li>Runs the install command with the enrollment token via {@code --enrollment-token-file -}</li>
     * </ol>
     *
     * @param serverHost       server hostname (from {@link #resolveServerHost()})
     * @param alias            human-readable agent alias (used only in comments)
     * @param enrollmentToken  one-time enrollment token to embed in the script
     * @param mode             "log" or "edr"
     * @param expiresAt        human-readable expiry string (used only in comments)
     * @param insecure         whether to skip TLS certificate validation (true for local dev)
     * @return complete, executable bash script
     */
    public String buildBashScript(String serverHost, String alias, String enrollmentToken,
                                  String mode, String expiresAt, boolean insecure) {
        String insecureFlag = insecure ? "yes" : "no";
        String curlInsecureFlag = insecure ? " -k" : "";
        String escapedToken = escapeBashDoubleQuoted(enrollmentToken);

        return "#!/bin/bash\n"
            + "# ============================================================\n"
            + "#  HiveArmor Agent — One-Click Install Script\n"
            + "#  Agent alias : " + alias + "\n"
            + "#  Token expires : " + expiresAt + "\n"
            + "#  Platform    : Linux / macOS\n"
            + "#\n"
            + "#  WARNING: This script contains your one-time enrollment token.\n"
            + "#  Treat it like a password. Do NOT share or commit to Git.\n"
            + "# ============================================================\n"
            + "set -e\n"
            + "\n"
            + "SERVER=\"" + serverHost + "\"\n"
            + "TOKEN=\"" + escapedToken + "\"\n"
            + "MODE=\"" + mode + "\"\n"
            + "INSECURE=\"" + insecureFlag + "\"\n"
            + "\n"
            + "# ---- Detect OS and CPU architecture -------------------------\n"
            + "OS=$(uname -s | tr '[:upper:]' '[:lower:]')\n"
            + "ARCH=$(uname -m)\n"
            + "case \"$ARCH\" in\n"
            + "  x86_64)        ARCH=\"amd64\" ;;\n"
            + "  aarch64|arm64) ARCH=\"arm64\" ;;\n"
            + "  *) echo \"Unsupported architecture: $ARCH\"; exit 1 ;;\n"
            + "esac\n"
            + "case \"$OS\" in\n"
            + "  linux|darwin) ;;\n"
            + "  *) echo \"Unsupported OS: $OS\"; exit 1 ;;\n"
            + "esac\n"
            + "\n"
            + "BINARY=\"hivearmor_agent_service_${OS}_${ARCH}\"\n"
            + "DOWNLOAD_URL=\"https://${SERVER}/agent-packages/${BINARY}\"\n"
            + "FALLBACK_URL=\"https://${SERVER}:9001/private/dependencies/agent/${BINARY}\"\n"
            + "DEST=\"/tmp/hivearmor_agent_service\"\n"
            + "\n"
            + "# ---- Download -----------------------------------------------\n"
            + "echo \"[1/3] Downloading HiveArmor Agent (${OS}/${ARCH})...\"\n"
            + "if ! curl -fsSL" + curlInsecureFlag + " -o \"$DEST\" \"$DOWNLOAD_URL\"; then\n"
            + "  echo \"Primary package URL unavailable, trying dependency server...\"\n"
            + "  curl -fsSL" + curlInsecureFlag + " -o \"$DEST\" \"$FALLBACK_URL\"\n"
            + "fi\n"
            + "chmod +x \"$DEST\"\n"
            + "\n"
            + "# ---- Install ------------------------------------------------\n"
            + "echo \"[2/3] Installing (mode: ${MODE})...\"\n"
            + "echo \"$TOKEN\" | sudo \"$DEST\" install \"$SERVER\" \"$INSECURE\" --enrollment-token-file - --mode=\"$MODE\"\n"
            + "\n"
            + "# ---- Verify -------------------------------------------------\n"
            + "echo \"[3/3] Verifying service...\"\n"
            + "if command -v systemctl &>/dev/null; then\n"
            + "  sudo systemctl status hivearmor-agent --no-pager 2>/dev/null || true\n"
            + "elif command -v launchctl &>/dev/null; then\n"
            + "  launchctl list | grep hivearmor || true\n"
            + "fi\n"
            + "echo \"Done. Agent '" + alias + "' registered with HiveArmor.\"\n";
    }

    /**
     * Builds a PowerShell script for Windows that:
     * <ol>
     *   <li>Self-elevates when double-clicked without administrator rights</li>
     *   <li>Detects CPU architecture (amd64 / arm64)</li>
     *   <li>Downloads the correct .exe binary from {@code /agent-packages/} on HTTPS 443</li>
     *   <li>Runs the installer elevated with enrollment token via a protected temp file</li>
     * </ol>
     *
     * @param serverHost       server hostname
     * @param alias            human-readable agent alias (used only in comments)
     * @param enrollmentToken  one-time enrollment token to embed in the script
     * @param mode             "log" or "edr"
     * @param expiresAt        human-readable expiry string (used only in comments)
     * @param insecure         whether to skip TLS certificate validation
     * @return complete, executable PowerShell script
     */
    public String buildPowerShellScript(String serverHost, String alias, String enrollmentToken,
                                        String mode, String expiresAt, boolean insecure) {
        String skipTls = insecure ? POWER_SHELL_TLS_BYPASS_SNIPPET : "";
        String skipCert = insecure ? "yes" : "no";
        String escapedHost = escapePowerShellDoubleQuoted(serverHost);
        String escapedToken = escapePowerShellDoubleQuoted(enrollmentToken);
        String escapedMode = escapePowerShellDoubleQuoted(mode);

        return "# ============================================================\n"
            + "#  HiveArmor Agent — One-Click Install Script (Windows)\n"
            + "#  Agent alias : " + alias + "\n"
            + "#  Token expires : " + expiresAt + "\n"
            + "#\n"
            + "#  WARNING: This script contains your one-time enrollment token.\n"
            + "#  Treat it like a password. Do NOT share or commit to Git.\n"
            + "# ============================================================\n"
            + "$ErrorActionPreference = 'Stop'\n"
            + "\n"
            + "# ---- Self-elevate when launched without admin (e.g. double-click) ----\n"
            + "$isAdmin = ([Security.Principal.WindowsPrincipal]"
            + "[Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole("
            + "[Security.Principal.WindowsBuiltInRole]::Administrator)\n"
            + "if (-not $isAdmin) {\n"
            + "  if ($PSCommandPath) {\n"
            + "    $elevateArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)\n"
            + "    Start-Process powershell.exe -Verb RunAs -ArgumentList $elevateArgs -Wait | Out-Null\n"
            + "    exit $LASTEXITCODE\n"
            + "  }\n"
            + "  Write-Error 'Re-run this script in an elevated (Run as Administrator) PowerShell session.'\n"
            + "  exit 1\n"
            + "}\n"
            + "\n"
            + "$Server  = \"" + escapedHost + "\"\n"
            + "$Token   = \"" + escapedToken + "\"\n"
            + "$Mode    = \"" + escapedMode + "\"\n"
            + "$SkipCert = \"" + skipCert + "\"\n"
            + "\n"
            + skipTls
            + "# ---- Detect architecture ------------------------------------\n"
            + "$Arch = if ($env:PROCESSOR_ARCHITECTURE -match 'ARM64') { 'arm64' } else { 'amd64' }\n"
            + "\n"
            + "$Binary = \"hivearmor_agent_service_windows_$Arch.exe\"\n"
            + "$Url    = \"https://$Server/agent-packages/$Binary\"\n"
            + "$Fallback = \"https://$Server`:9001/private/dependencies/agent/$Binary\"\n"
            + "$Dest   = Join-Path $env:TEMP $Binary\n"
            + "\n"
            + "# ---- Download -----------------------------------------------\n"
            + "Write-Host \"[1/3] Downloading HiveArmor Agent (windows/$Arch)...\"\n"
            + "try { Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing } catch {\n"
            + "  Write-Host \"Primary package URL unavailable, trying dependency server...\"\n"
            + "  Invoke-WebRequest -Uri $Fallback -OutFile $Dest -UseBasicParsing\n"
            + "}\n"
            + "Unblock-File -Path $Dest -ErrorAction SilentlyContinue\n"
            + "\n"
            + "# ---- Install ------------------------------------------------\n"
            + "Write-Host \"[2/3] Installing (mode: $Mode)...\"\n"
            + "$TokenFile = Join-Path $env:TEMP (\"hivearmor-enroll-\" + [guid]::NewGuid().ToString(\"N\") + \".token\")\n"
            + "try {\n"
            + "  $utf8NoBom = New-Object System.Text.UTF8Encoding $false\n"
            + "  [System.IO.File]::WriteAllText($TokenFile, $Token, $utf8NoBom)\n"
            + "  icacls $TokenFile /inheritance:r | Out-Null\n"
            + "  $adminSid = New-Object System.Security.Principal.SecurityIdentifier 'S-1-5-32-544'\n"
            + "  $adminName = $adminSid.Translate([System.Security.Principal.NTAccount]).Value\n"
            + "  icacls $TokenFile /grant:r \"$($env:USERNAME):(R,W)\" \"$($adminName):(R,W)\" \"SYSTEM:(R,W)\" | Out-Null\n"
            + "  $installArgs = @('install', $Server, $SkipCert, '--enrollment-token-file', $TokenFile, '--mode', $Mode)\n"
            + "  $proc = Start-Process -FilePath $Dest -ArgumentList $installArgs -Wait -PassThru\n"
            + "  if ($proc.ExitCode -ne 0) { throw \"Agent install failed (exit $($proc.ExitCode))\" }\n"
            + "} finally {\n"
            + "  Remove-Item -Force $TokenFile -ErrorAction SilentlyContinue\n"
            + "}\n"
            + "\n"
            + "# ---- Verify -------------------------------------------------\n"
            + "Write-Host \"[3/3] Verifying service...\"\n"
            + "$svc = Get-Service -Name 'HiveArmorAgent' -ErrorAction SilentlyContinue\n"
            + "if ($svc) { Write-Host \"Service status: $($svc.Status)\" }\n"
            + "Write-Host \"Done. Agent '" + alias + "' registered with HiveArmor.\"\n";
    }

    /**
     * PowerShell 5.1 TLS bypass for self-signed staging / local-dev certificates.
     * Matches the pattern used in {@code agent/release/verify-packaged-windows.ps1}.
     */
    private static final String POWER_SHELL_TLS_BYPASS_SNIPPET =
        "[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12\n"
        + "[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }\n"
        + "\n";

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** Escapes a value for embedding inside bash double-quoted strings. */
    static String escapeBashDoubleQuoted(String value) {
        if (value == null) {
            return "";
        }
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("$", "\\$")
            .replace("`", "\\`");
    }

    /** Escapes a value for embedding inside PowerShell double-quoted strings. */
    static String escapePowerShellDoubleQuoted(String value) {
        if (value == null) {
            return "";
        }
        return value
            .replace("`", "``")
            .replace("\"", "`\"")
            .replace("$", "`$");
    }
}
