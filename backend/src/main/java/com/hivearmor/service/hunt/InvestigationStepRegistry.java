package com.hivearmor.service.hunt;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Static registry mapping MITRE ATT&CK technique IDs to recommended investigation steps.
 *
 * <p>Each technique maps to 3-7 actionable steps that guide SOC analysts through the
 * investigation process for that specific attack technique. Steps are ordered from
 * initial triage through deep-dive analysis.
 *
 * <p>Unknown techniques fall back to {@link #GENERIC_STEPS} — a set of universally
 * applicable investigation steps.
 *
 * <p><strong>ALT-009:</strong> Detection guide — investigation steps lookup.
 */
@Component
public class InvestigationStepRegistry {

    /**
     * Maps MITRE technique IDs to ordered investigation steps.
     * Covers 25 common techniques observed in enterprise environments.
     */
    private static final Map<String, List<String>> TECHNIQUE_STEPS = Map.ofEntries(

        // --- Sub-task 5.2: First 10 techniques ---

        Map.entry("T1059.001", List.of(
            "Verify the parent process chain: confirm whether an Office application, script host, or service spawned powershell.exe",
            "Decode any base64 or encoded command-line arguments using CyberChef or built-in decoder and review for IOCs (URLs, IPs, file paths, registry keys)",
            "Check if the PowerShell execution policy was bypassed (-ExecutionPolicy Bypass or -ep bypass flags)",
            "Review network connections initiated by the PowerShell process within 60 seconds of execution for C2 beaconing patterns",
            "Search for persistence mechanisms created by the session: scheduled tasks, registry run keys, or WMI event subscriptions",
            "Correlate with email gateway logs if the parent process is an Office application — identify the source email and sender",
            "Check for lateral movement: WinRM sessions, SMB file copies, or PsExec-style remote execution from this host within 5 minutes"
        )),

        Map.entry("T1059.003", List.of(
            "Review the full command-line arguments of cmd.exe — check for chained commands, redirects to temp directories, or download utilities (certutil, bitsadmin)",
            "Identify the parent process: unexpected parents (e.g., IIS w3wp.exe, SQL Server sqlservr.exe, Java) indicate exploitation",
            "Check for follow-on child processes spawned by this cmd.exe session (powershell, wscript, mshta, net.exe, whoami)",
            "Examine any files written to disk by commands in the session — focus on %TEMP%, %APPDATA%, and public-writable directories",
            "Look for reconnaissance commands: whoami, ipconfig, net group, systeminfo, tasklist executed in sequence"
        )),

        Map.entry("T1566.001", List.of(
            "Identify the source email: query mail gateway logs for the attachment filename and recipient address",
            "Verify the sender reputation: check SPF/DKIM/DMARC results and whether the sending domain is newly registered (< 30 days)",
            "Submit the attachment hash to threat intelligence feeds (VirusTotal, internal TI platform) for known malware verdicts",
            "Determine if the attachment was opened: check for child processes spawned by the email client (OUTLOOK.EXE → WINWORD.EXE → powershell.exe)",
            "Identify all recipients of the same email across the organization — check for other users who also opened the attachment",
            "Review the macro content if the file is Office-based: extract VBA code and check for auto-execution triggers (AutoOpen, Document_Open)"
        )),

        Map.entry("T1566.002", List.of(
            "Extract the URL from the email body or attachment and check it against URL reputation services and internal blocklists",
            "Determine if the user clicked the link: review proxy/web gateway logs for outbound requests to the URL from the user's workstation",
            "Check the landing page for credential harvesting: does the URL host a login form mimicking a legitimate service (O365, VPN portal)?",
            "If credentials were entered: immediately reset the user's password, revoke active sessions, and check for anomalous logins since the click timestamp",
            "Identify all recipients of the same phishing email and verify no other users interacted with the link",
            "Check DNS queries from the affected host for the domain — look for follow-on connections indicating payload download"
        )),

        Map.entry("T1547.001", List.of(
            "Query the registry key path (HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run or HKLM equivalent) for the suspicious entry",
            "Identify when the registry modification occurred and which process wrote the value — correlate with process creation events",
            "Examine the binary or script path referenced in the registry value — check file hash against threat intelligence",
            "Determine if the persistence mechanism has already executed at least once since being written",
            "Check for other persistence mechanisms installed by the same process: scheduled tasks, startup folder items, WMI subscriptions"
        )),

        Map.entry("T1053.005", List.of(
            "Query the Windows Task Scheduler for the suspicious task: review the task XML for trigger type, execution time, and action (command/binary path)",
            "Identify the account context the task runs under — SYSTEM, specific service account, or user context indicates different threat levels",
            "Check when the task was created and by which process (schtasks.exe, AT command, or COM interface)",
            "Examine the binary or script executed by the task — submit hash to TI and verify digital signature if present",
            "Review task execution history: has it already fired? Check for associated process creation events at the scheduled trigger times",
            "Look for related lateral movement: was the task created remotely via RPC from another host?"
        )),

        Map.entry("T1021.001", List.of(
            "Review the source IP and username of the RDP session — determine if it originated from an expected jump host or an unusual source",
            "Check for brute-force patterns: multiple failed logons (Event ID 4625) from the same source preceding the successful session",
            "Verify whether the RDP session occurred during the user's normal working hours and from a known geographic location",
            "Review host-based activity after RDP login: process creation, file writes, and network connections initiated within the session",
            "Check if NLA (Network Level Authentication) was enforced — unauthenticated RDP exposure indicates misconfiguration",
            "Look for RDP tunneling indicators: connections to localhost:3389 or unusual RDP port forwarding configurations"
        )),

        Map.entry("T1021.002", List.of(
            "Identify the source host and account used for the SMB/Admin share connection (IPC$, C$, ADMIN$)",
            "Determine if the connection used explicit credentials or pass-the-hash — check for NTLM Type 3 messages with abnormal source",
            "Review files copied to or from the administrative share — check for executables, scripts, or configuration files",
            "Check if PsExec or a similar remote execution tool was used: look for PSEXESVC service installation on the target host",
            "Correlate with other lateral movement: did the same source account connect to multiple hosts via SMB within a short window?",
            "Verify the account's authorization: is it a domain admin or a service account being misused?"
        )),

        Map.entry("T1003.001", List.of(
            "Confirm the process that accessed LSASS memory — check for known credential dumping tools (mimikatz, procdump, comsvcs.dll MiniDump)",
            "Review the access rights requested on lsass.exe: PROCESS_VM_READ combined with PROCESS_QUERY_INFORMATION is highly suspicious",
            "Check if any memory dump files were written to disk: look for .dmp files in temp directories or writable shares",
            "Identify all accounts whose credentials may have been exposed — any user logged into the host at the time of the dump",
            "Immediately rotate passwords for all exposed accounts, prioritizing service accounts and domain admins",
            "Check for subsequent authentication from the compromised host using harvested credentials — look for pass-the-hash or pass-the-ticket activity"
        )),

        Map.entry("T1110.001", List.of(
            "Identify the target account(s) and source IP(s) involved in the brute-force attempt from authentication logs",
            "Determine the velocity: count failed login attempts per minute from the source — sustained high-rate indicates automated tooling",
            "Check if the brute-force was successful: look for a successful authentication event (4624) from the same source IP after the failures",
            "Verify account lockout policies: was the account locked, or is lockout disabled allowing unlimited attempts?",
            "Check if the source IP is internal (compromised host doing lateral movement) or external (internet-facing attack)",
            "Review the target accounts: are they default/service accounts (admin, administrator, sa, root) or user-specific?"
        )),

        // --- Sub-task 5.3: Next 10 techniques ---

        Map.entry("T1071.001", List.of(
            "Identify the destination IP/domain and check if it matches known C2 infrastructure in threat intelligence feeds",
            "Analyze the HTTP traffic pattern: check for regular beaconing intervals (e.g., every 60s ± jitter), consistent User-Agent strings, or unusual URI patterns",
            "Review the data volume per connection: C2 check-ins are typically small (< 1KB) with occasional larger downloads indicating tasking or payload delivery",
            "Check if the connection uses a legitimate cloud service as a proxy (GitHub, Dropbox, Google Drive, Slack) — domain fronting or API abuse",
            "Examine TLS certificate details if HTTPS: self-signed certs, unusual validity periods, or certificates not matching the domain indicate C2",
            "Look for follow-on activity after each C2 check-in: process creation, file writes, or additional network connections within seconds"
        )),

        Map.entry("T1041", List.of(
            "Measure outbound data volume to the suspected C2 destination — compare with the host's baseline egress to detect anomalous bulk transfers",
            "Check file access events preceding the exfiltration: which files or directories were read before the outbound transfer?",
            "Determine the data sensitivity: correlate accessed file paths with known sensitive data repositories (finance shares, HR data, source code repos)",
            "Review if data was staged before exfiltration: large archives (ZIP, RAR, 7z) created in temp directories shortly before the transfer",
            "Check for split/chunked transfers: multiple small uploads that individually appear benign but aggregate to large data movement"
        )),

        Map.entry("T1486", List.of(
            "Identify the process performing file encryption: check for known ransomware binary names, or unusual processes with high file I/O rates",
            "Determine the encryption scope: how many files and directories were affected? Check for ransom notes dropped alongside encrypted files",
            "Review the ransomware family indicators: file extension appended to encrypted files, ransom note content, known decryptor availability",
            "Immediately isolate the affected host from the network to prevent lateral encryption spread",
            "Check for data exfiltration BEFORE encryption: many ransomware groups steal data first — review outbound transfers in the preceding 24-72 hours",
            "Identify the initial access vector: trace back from the ransomware execution to the original compromise (phishing email, RDP, exploited vulnerability)",
            "Verify backup integrity: confirm offline/immutable backups are not compromised and can be used for restoration"
        )),

        Map.entry("T1078.002", List.of(
            "Review the authentication events for the domain account: identify unusual source hosts, times, or geographic locations",
            "Check if the account credentials were recently compromised: look for credential dumping events on hosts where this account was logged in",
            "Determine the account's privilege level: domain admin, server operator, or standard user — higher privileges indicate greater risk",
            "Review all activity performed with this account since the suspected compromise timestamp",
            "Check for impossible travel: authentications from geographically distant locations within an impossibly short time window",
            "Verify whether the account was used to create new accounts, modify group memberships, or elevate other accounts' privileges"
        )),

        Map.entry("T1055.001", List.of(
            "Identify the source process that performed the DLL injection and the target process that received the injected code",
            "Check the injected DLL: verify its file hash against threat intelligence and check if it has a valid digital signature",
            "Review the injection method: CreateRemoteThread + LoadLibrary, NtMapViewOfSection, or QueueUserAPC — each indicates different tooling",
            "Examine the target process behavior after injection: new network connections, file writes, or child processes spawned indicate successful code execution",
            "Check if the injection targets a privileged process (lsass.exe, services.exe, winlogon.exe) — this may indicate privilege escalation intent"
        )),

        Map.entry("T1543.003", List.of(
            "Query the Windows Service Control Manager for the newly created or modified service: review the service binary path, start type, and account",
            "Check the service binary: verify its file hash against threat intelligence, validate the digital signature, and review the file creation timestamp",
            "Identify which process or user created/modified the service: correlate with sc.exe usage, PowerShell New-Service, or direct registry modifications",
            "Determine if the service has already started: check for process creation events matching the service binary path",
            "Verify the service account context: LocalSystem or domain accounts running unexpected binaries indicate persistence or privilege escalation"
        )),

        Map.entry("T1218.011", List.of(
            "Review the full command line of rundll32.exe: identify the DLL being loaded and the export function being called",
            "Check if the loaded DLL is a known LOLBin abuse pattern: comsvcs.dll (MiniDump), javascript, vbscript, or shell32.dll for proxy execution",
            "Verify the DLL path: legitimate rundll32 usage typically references System32 DLLs — non-standard paths indicate malicious activity",
            "Identify the parent process: unexpected parents (cmd.exe, powershell.exe, Office apps) suggest the rundll32 is being used for defense evasion",
            "Check for network connections initiated by the rundll32 process — this indicates payload download or C2 communication",
            "Review child processes spawned by rundll32: legitimate usage rarely spawns additional processes"
        )),

        Map.entry("T1105", List.of(
            "Identify the remote source URL or IP from which the tool was downloaded — check against TI feeds and URL reputation",
            "Determine which process performed the download: certutil, bitsadmin, PowerShell Invoke-WebRequest, curl, or a browser indicate different attack stages",
            "Locate the downloaded file on disk: check common drop locations (%TEMP%, %APPDATA%, Public folders, webserver writable directories)",
            "Submit the file hash to threat intelligence platforms and sandbox services for verdict",
            "Check if the downloaded tool was executed: look for process creation events matching the file path after the download timestamp",
            "Review the download method for defense evasion: alternate data streams, renamed utilities, or encoded transfers indicate sophistication"
        )),

        Map.entry("T1562.001", List.of(
            "Identify which security tool was disabled or modified: AV service stopped, EDR agent tampered, firewall rules changed, or audit policy reduced",
            "Determine the method used: service stop command (net stop, sc stop), process termination (taskkill), driver unload, or configuration change",
            "Check the process and user context that performed the disabling action — legitimate admin maintenance vs. attacker evasion",
            "Review the timeline: was security tooling disabled immediately before another suspicious activity (malware execution, lateral movement, data exfiltration)?",
            "Verify current sensor coverage: confirm the security tool is now operational and reporting — if not, manually restore it",
            "Check for other hosts where the same disabling technique was applied within the same time window"
        )),

        Map.entry("T1070.004", List.of(
            "Identify which files were deleted and from which directory — focus on temp directories, log paths, and directories containing previously detected malware",
            "Determine the deletion method: del/rm command, SDelete (secure wipe), or programmatic deletion via API — secure wiping indicates anti-forensics intent",
            "Check the process that performed the deletion: was it the same process that created the suspicious files, or a cleanup script run later?",
            "Review file creation events preceding the deletion: reconstruct what files existed and their hashes before they were removed",
            "Check for Volume Shadow Copy deletion (vssadmin delete shadows) which often accompanies file cleanup to prevent recovery"
        )),

        // --- Sub-task 5.4: Final 5 techniques ---

        Map.entry("T1190", List.of(
            "Identify the exploited application and its version — check for known CVEs matching the software version running on the target",
            "Review web server or application logs for the exploitation payload: unusual HTTP methods, oversized parameters, serialized objects, or shell command injection patterns",
            "Determine the initial foothold: was a webshell deployed, a reverse shell spawned, or remote code execution achieved directly?",
            "Check for post-exploitation activity from the application's process context: unexpected child processes, network connections to internal hosts, or file writes outside the web root",
            "Verify patching status: confirm whether the vulnerability has been patched or if the system remains exploitable",
            "Check for other hosts running the same vulnerable application version within the organization"
        )),

        Map.entry("T1036.005", List.of(
            "Compare the suspicious file's full path with the legitimate binary's expected location (e.g., svchost.exe should only run from System32)",
            "Verify the file hash: legitimate Windows binaries have known hashes — compare against Microsoft's catalog or a known-good baseline image",
            "Check the digital signature: legitimate OS binaries are signed by Microsoft — unsigned or differently-signed files with system binary names are malicious",
            "Review the parent process: legitimate system processes have expected parent chains (svchost.exe → services.exe) — deviations indicate masquerading",
            "Look for typosquatting: svch0st.exe, scvhost.exe, or similar near-miss names designed to evade quick visual review"
        )),

        Map.entry("T1027", List.of(
            "Identify the obfuscation method: base64 encoding, XOR encryption, string concatenation, variable substitution, or packing/compression",
            "Attempt to deobfuscate the payload: use CyberChef, de4dot, or manual analysis to recover the original code or script",
            "Check for known obfuscation tool signatures: Invoke-Obfuscation patterns, custom packers, or commercial crypters with known unpacking routines",
            "Review the execution context: obfuscated scripts run via PowerShell, wscript, or cmd.exe suggest different attacker tooling sophistication",
            "Submit the obfuscated sample to a sandbox for dynamic analysis — behavioral detonation reveals the true payload regardless of static obfuscation",
            "Check for staged deobfuscation: initial script that downloads and decodes a second-stage payload from an external source"
        )),

        Map.entry("T1569.002", List.of(
            "Identify the service that was created or modified to execute the payload — query the Service Control Manager for recently added services",
            "Review the service binary path for known malicious patterns: binaries in temp directories, cmd.exe /c chains, or PowerShell encoded commands",
            "Determine if the service was created remotely: check for inbound SMB connections and sc.exe execution context from a remote source",
            "Verify the account under which the service runs — SYSTEM-level service execution indicates the attacker has elevated privileges",
            "Check for cleanup: was the service deleted after execution? Ephemeral services are commonly used by PsExec and similar tools"
        )),

        Map.entry("T1048.003", List.of(
            "Identify the exfiltration channel: DNS tunneling, HTTP POST to uncommon ports, FTP, or raw TCP connections to external IPs",
            "Measure the data volume transferred over the unencrypted channel — compare with the host's baseline to quantify potential data loss",
            "Capture or reconstruct the exfiltrated content if possible: unencrypted channels allow network-level inspection of transferred data",
            "Identify the source process performing the exfiltration: a legitimate application (browser, curl) or a custom/unknown binary",
            "Check for data staging prior to exfiltration: files compressed or packaged in accessible directories before the transfer",
            "Determine what data was accessed: correlate file read events in the preceding hours with the total exfiltrated volume"
        ))
    );

    /**
     * Generic fallback steps used when the alert's MITRE technique ID is not in the registry.
     * These steps apply universally to any security event investigation.
     */
    private static final List<String> GENERIC_STEPS = List.of(
        "Review the alert timeline for preceding and following events within a 15-minute window on the same host",
        "Check for related alerts involving the same entity (host, user, or IP) in the past 72 hours",
        "Validate the affected asset's criticality and exposure — determine if it holds sensitive data or has internet-facing services",
        "Search for similar patterns across other hosts in the environment to identify potential lateral spread",
        "Review network traffic from the affected host during the event window for anomalous outbound connections"
    );

    /**
     * Returns investigation steps for the given MITRE technique ID.
     * Falls back to generic steps if the technique is unknown or null.
     *
     * @param techniqueId MITRE ATT&CK technique ID (e.g., "T1059.001"), may be null
     * @return ordered list of investigation steps (3-7 entries)
     */
    public List<String> getSteps(String techniqueId) {
        if (techniqueId == null || techniqueId.isBlank()) {
            return GENERIC_STEPS;
        }
        return TECHNIQUE_STEPS.getOrDefault(techniqueId, GENERIC_STEPS);
    }
}
